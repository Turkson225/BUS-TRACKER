import type { Database, Statement, Result, Environment } from './context.ts';
export const normalize = (sql: string) => sql.trim().replace(/\s+/g, ' ');
export async function queryId(sql: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(sql)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
class Prepared implements Statement {
  readonly db: SupabaseDatabase; readonly sql: string; readonly args: unknown[];
  constructor(db: SupabaseDatabase, sql: string, args: unknown[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args: unknown[]) { return new Prepared(this.db, this.sql, args); }
  async first<T>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async all<T>(): Promise<Result<T>> { return (await this.db.batch([this]))[0] as Result<T>; }
  run(): Promise<Result> { return this.all(); }
}
export class SupabaseDatabase implements Database {
  readonly env: Environment;
  constructor(env: Environment) { this.env = env; }
  prepare(sql: string) { return new Prepared(this, sql); }
  async batch(statements: Statement[]): Promise<Result[]> {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Database connection unavailable');
    const operations = await Promise.all(statements.map(async statement => {
      if (!(statement instanceof Prepared) || statement.db !== this) throw new Error('Invalid database operation');
      return { id: await queryId(statement.sql), args: statement.args };
    }));
    const response = await fetch(`${this.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/transport_execute`, {
      method: 'POST', headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }), signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.code === '23505') throw new Error('UNIQUE constraint failed: ' + (result.message ?? 'database uniqueness guard'));
      throw new Error('Database operation failed: ' + (result.code ?? response.status));
    }
    if (!Array.isArray(result) || result.length !== statements.length) throw new Error('Invalid database response');
    return result;
  }
}
