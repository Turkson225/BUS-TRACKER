export const workerSections = ['Flightops', 'Fulops', 'CCA'] as const;
export type WorkerSection = typeof workerSections[number];
export type SignInIntent = { role: 'worker' | 'driver'; section: WorkerSection | null };
const key = 'onroute-sign-in-choice';
export function readSignInIntent(): SignInIntent | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value?.role === 'driver') return { role: 'driver', section: null };
    if (value?.role === 'worker' && workerSections.includes(value.section)) return { role: 'worker', section: value.section };
  } catch { /* The choice is optional when storage is unavailable. */ }
  return null;
}
export function rememberSignInIntent(value: SignInIntent | null) {
  try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* Continue sign-in without storage. */ }
}
