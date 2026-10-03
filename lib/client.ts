type ClerkClient = {
  user: unknown;
  session: { getToken(): Promise<string | null> } | null;
  load(options: unknown): Promise<void>;
  openSignIn(options?: unknown): void;
  signOut(options?: unknown): Promise<void>;
  addListener(listener: (state: { user: unknown }) => void): () => void;
};
declare global {
  interface Window { Clerk: ClerkClient; __internal_ClerkUICtor: unknown }
}
export const base = import.meta.env.BASE_URL;
export const configured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && import.meta.env.VITE_SUPABASE_URL);
let loading: Promise<ClerkClient> | undefined;
export function loadClerk() {
  return loading ??= (async () => {
    const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (!/^pk_(test|live)_/.test(key ?? '')) throw new Error('Add your Clerk publishable key to connect sign-in.');
    const domain = atob(key.split('_')[2]).replace(/\$$/, '');
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error('Invalid Clerk publishable key.');
    for (const resource of ['@clerk/ui@1/dist/ui.browser.js', '@clerk/clerk-js@6/dist/clerk.browser.js']) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://${domain}/npm/${resource}`;
        script.async = true; script.crossOrigin = 'anonymous';
        script.dataset.clerkPublishableKey = key;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Sign-in could not load. Check your connection and Clerk settings.'));
        document.head.append(script);
      });
    }
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor }, signInForceRedirectUrl: location.origin + base, signUpForceRedirectUrl: location.origin + base });
    return window.Clerk;
  })().catch(error => { loading = undefined; throw error; });
}
export function signIn() { void loadClerk().then(clerk => clerk.openSignIn({ signInForceRedirectUrl: location.origin + base, signUpForceRedirectUrl: location.origin + base })); }
export async function request(body?: unknown) {
  const service = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  if (!service || !configured) throw new Error('Connect Clerk and Supabase to use the live tracker.');
  const token = await (await loadClerk()).session?.getToken();
  if (!token) throw Object.assign(new Error('Sign in to use company transport.'), { status: 401 });
  const res = await fetch(`${service}/functions/v1/transport`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  });
  let data;
  try { data = await res.json(); } catch { throw new Error('Transport service could not be reached. Check your connection.'); }
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Could not complete the request.'), { status: res.status });
  return data;
}
