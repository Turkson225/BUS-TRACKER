import { GET, POST } from './core/api.ts';
import { authenticate } from './core/auth.ts';
import { withContext, type Database, type Environment, type User } from './core/context.ts';
import { SupabaseDatabase } from './core/postgres.ts';
import { AppError } from './core/errors.ts';
export function createHandler(env: Environment, options: { database?: Database; authenticate?: (request: Request, env: Environment) => Promise<User>; waitUntil?: (promise: Promise<unknown>) => void } = {}) {
  const db = options.database ?? new SupabaseDatabase(env);
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'authorization,content-type,apikey,x-client-info', 'Access-Control-Max-Age': '600', 'X-OnRoute-Backend': '20261004-auth-diagnostics' });
    if (origin && origin === env.APP_ORIGIN) headers.set('Access-Control-Allow-Origin', origin);
    const respond = (body: unknown, status: number) => Response.json(body, { status, headers });
    if (origin && origin !== env.APP_ORIGIN) return respond({ error: 'Request origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!['GET', 'POST'].includes(request.method)) return respond({ error: 'Method not allowed.' }, 405);
    let stage = 'authentication';
    try {
      const user = options.authenticate ? await options.authenticate(request, env) : await authenticate(request, env, name => { stage = name; });
      stage = 'company-state';
      const response = await withContext({ db, env, user, waitUntil: options.waitUntil ?? (promise => { void promise.catch(error => console.error('Alert delivery failed', String(error))); }) }, () => request.method === 'GET' ? GET() : POST(request));
      for (const [key, value] of headers) response.headers.set(key, value);
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        if (error.status >= 500) console.error('Transport setup or provider error', JSON.stringify({ stage, message: error.message }));
        return respond({ error: error.message }, error.status);
      }
      const reference = crypto.randomUUID();
      // Deliberately omit request headers, account data, raw errors and secret values.
      console.error('Transport handler failed', JSON.stringify({ reference, stage, errorType: error instanceof Error ? error.name : 'Unknown error' }));
      return respond({ error: `Transport service is temporarily unavailable. Please retry. Reference: ${reference}` }, 503);
    }
  };
}
