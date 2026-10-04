// Test-only identity injection. The deployed entrypoint always verifies Clerk.
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { createHandler } from '../supabase/functions/transport/handler.ts';
import { AppError } from '../supabase/functions/transport/core/errors.ts';
import { SupabaseDatabase } from '../supabase/functions/transport/core/postgres.ts';
import { execFileSync } from 'node:child_process';
class Prepared {
  constructor(db, sql, args=[]) { this.db=db; this.sql=sql; this.args=args; }
  bind(...args) { return new Prepared(this.db,this.sql,args); }
  async first() { return (await this.all()).results[0]??null; }
  async all() { const results=this.db.native.prepare(this.sql).all(...this.args);return {results,meta:{changes:0}}; }
  async run() { const info=this.db.native.prepare(this.sql).run(...this.args);return {results:[],meta:{changes:Number(info.changes)}}; }
}
export class SQLiteDatabase {
  native=new DatabaseSync(':memory:');
  prepare(sql) { return new Prepared(this,sql); }
  async batch(statements) {
    this.native.exec('BEGIN');
    try { const results=statements.map(statement=>{const info=this.native.prepare(statement.sql).run(...statement.args);return {results:[],meta:{changes:Number(info.changes)}};});this.native.exec('COMMIT');return results; }
    catch(error) { this.native.exec('ROLLBACK');throw error; }
  }
}
export const sqlQuote=value=>"'"+value.replaceAll("'","''")+"'";
export function psql(sql) {
  return execFileSync('psql',[process.env.DATABASE_URL,'-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
class PostgresInspection {
  prepare(sql) {
    let values=[];
    const rendered=()=>{let i=0;return sql.replace(/\?/g,()=>{const value=values[i++];return value==null?'NULL':sqlQuote(String(value));});};
    const statement={
      bind(...args){values=args;return statement;},
      async all(){const query=rendered();const rows=JSON.parse(psql("SET search_path=transport_private,pg_catalog;SELECT coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) FROM ("+query+") row;"));return {results:rows,meta:{changes:0}};},
      async first(){return (await statement.all()).results[0]??null;},
      async run(){psql('SET search_path=transport_private,pg_catalog;'+rendered());return {results:[],meta:{changes:1}};},
    };return statement;
  }
}
export async function resetPostgres() {
  const migration=await readFile(new URL('../supabase/migrations/20261003200000_transport.sql',import.meta.url),'utf8');
  psql("DROP FUNCTION IF EXISTS public.transport_execute(jsonb);DROP SCHEMA IF EXISTS transport_private CASCADE;");
  psql(migration);
  psql(await readFile(new URL('../supabase/migrations/20261004120000_worker_sections.sql',import.meta.url),'utf8'));
}
export async function testRuntime({bindings={},outboundService,clock=false}={}) {
  const OriginalDate=Date,originalFetch=globalThis.fetch;
  let current=OriginalDate.now();
  if(clock) globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[current]));}static now(){return current;}};
  const env={ADMIN_EMAIL:'admin@example.test',APP_ORIGIN:'https://pilot.test',...bindings};
  let db;
  if(process.env.DATABASE_URL){await resetPostgres();Object.assign(env,{SUPABASE_URL:'https://postgres-fixture.test',SUPABASE_SERVICE_ROLE_KEY:'test-service-key'});db=new SupabaseDatabase(env);}
  else {
    db=new SQLiteDatabase();
    const folder=new URL('./fixtures/',import.meta.url);
    for(const name of (await readdir(folder)).filter(f=>f.endsWith('.sql')).sort())db.native.exec((await readFile(new URL(name,folder),'utf8')).replaceAll('--> statement-breakpoint',''));
  }
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);
    if(new URL(request.url).hostname==='postgres-fixture.test'){
      const {operations}=await request.json();
      try {return Response.json(JSON.parse(psql('SET ROLE service_role;SELECT public.transport_execute('+sqlQuote(JSON.stringify(operations))+'::jsonb);')));}
      catch(error){return Response.json({code:error.stderr?.includes('duplicate key')?'23505':'XX000',message:String(error.stderr)},{status:400});}
    }
    if(outboundService)return outboundService(request);
    throw new Error('Unexpected external request during an isolated test: '+request.url);
  };
  const pending=new Set();
  const handler=createHandler(env,{database:db,authenticate:async request=>{
    const id=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
    if(!id||!email)throw new AppError('Sign in to use company transport.',401);
    return {userId:id,email,displayName:email};
  },waitUntil:promise=>{pending.add(promise);promise.finally(()=>pending.delete(promise));}});
  return {
    getD1Database:async()=>process.env.DATABASE_URL?new PostgresInspection():db,
    dispatchFetch:async(url,init)=>{const request=new Request(url,init);if(clock)current=Number(request.headers.get('x-test-clock'));return handler(request);},
    dispose:async()=>{await Promise.allSettled([...pending]);globalThis.fetch=originalFetch;globalThis.Date=OriginalDate;db.native?.close();},
  };
}
