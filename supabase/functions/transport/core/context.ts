import { AsyncLocalStorage } from 'node:async_hooks';
export type User = { userId: string; email: string; displayName: string };
export type Result<T = unknown> = { results: T[]; meta: { changes: number } };
export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<Result<T>>;
  run(): Promise<Result>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<Result[]> }
export type Environment = Record<string, string | undefined>;
type Context = { db: Database; env: Environment; user: User; waitUntil: (promise: Promise<unknown>) => void };
const storage = new AsyncLocalStorage<Context>();
export const withContext = <T>(context: Context, callback: () => T) => storage.run(context, callback);
function current() { const ctx = storage.getStore(); if (!ctx) throw new Error('Request context unavailable'); return ctx; }
export const database = () => current().db;
export const runtime = () => current().env;
export const getAuthenticatedUser = async () => current().user;
export const waitUntil = (promise: Promise<unknown>) => current().waitUntil(promise);
