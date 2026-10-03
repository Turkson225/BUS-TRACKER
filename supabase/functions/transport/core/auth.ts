import { AppError } from './errors.ts';
import type { Environment, User } from './context.ts';
type Key = JsonWebKey & { kid: string };
const keyCache = new Map<string, { until: number; keys: Key[] }>();
const userCache = new Map<string, { until: number; user: User }>();
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Malformed token');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
async function keys(issuer: string, refresh = false) {
  const cached = keyCache.get(issuer);
  if (!refresh && cached && cached.until > Date.now()) return cached.keys;
  const res = await fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!res.ok) throw new AppError('Sign-in verification is temporarily unavailable.', 503);
  const data = await res.json();
  if (!Array.isArray(data.keys) || data.keys.length > 20) throw new AppError('Sign-in verification is unavailable.', 503);
  keyCache.set(issuer, { until: Date.now() + 300000, keys: data.keys });
  return data.keys as Key[];
}
export async function authenticate(request: Request, env: Environment): Promise<User> {
  const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || token.length > 10000) throw new AppError('Sign in to use company transport.', 401);
  const issuer = env.CLERK_ISSUER?.replace(/\/$/, '');
  if (!issuer || !env.CLERK_SECRET_KEY || !env.APP_ORIGIN) throw new AppError('Company sign-in has not been connected.', 503);
  const address = new URL(issuer);
  if (address.protocol !== 'https:' || address.origin !== issuer) throw new AppError('Company sign-in settings are invalid.', 503);
  let claims: any;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Unsupported signature');
    let key = (await keys(issuer)).find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!key) key = (await keys(issuer, true)).find(k => k.kid === header.kid && k.kty === 'RSA');
    if (!key) throw new Error('Unknown signing key');
    const cryptoKey = await crypto.subtle.importKey('jwk', key, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const now = Date.now() / 1000;
    if (!valid || claims.iss !== issuer || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 5 || !Number.isFinite(claims.iat) || claims.iat > now + 5 || claims.azp !== env.APP_ORIGIN || claims.sts === 'pending' || !/^user_[A-Za-z0-9]+$/.test(claims.sub ?? '') || !/^sess_[A-Za-z0-9]+$/.test(claims.sid ?? '')) throw new Error('Invalid session');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Your sign-in has expired or could not be verified. Sign in again.', 401);
  }
  // Roles and addresses never come from browser input or custom JWT claims.
  const cacheId = issuer + ':' + claims.sub;
  const cached = userCache.get(cacheId);
  if (cached && cached.until > Date.now()) return cached.user;
  const response = await fetch(`https://api.clerk.com/v1/users/${claims.sub}`, { headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` }, signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new AppError('Your account could not be checked. Please retry.', 503);
  const profile = await response.json();
  const primary = profile.email_addresses?.find((email: any) => email.id === profile.primary_email_address_id && email.verification?.status === 'verified');
  if (profile.id !== claims.sub || profile.banned || profile.locked || !primary || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primary.email_address)) throw new AppError('A verified company email is required.', 403);
  const user = { userId: claims.sub, email: primary.email_address.toLowerCase(), displayName: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || primary.email_address };
  if (userCache.size > 500) userCache.clear();
  userCache.set(cacheId, { until: Date.now() + 30000, user });
  return user;
}
