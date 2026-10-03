import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { psql,resetPostgres,sqlQuote } from './test-runtime.mjs';
import { queryId } from '../supabase/functions/transport/core/postgres.ts';
if(!process.env.DATABASE_URL){console.log('PostgreSQL checks run in GitHub Actions against an isolated PostgreSQL 17 database.');process.exit(0);}
await resetPostgres();
const rpc=operations=>'SELECT public.transport_execute('+sqlQuote(JSON.stringify(operations))+'::jsonb);';
const insert={id:await queryId('INSERT INTO settings (id,value) VALUES (?,?)'),args:['company',"Morning's company; DROP SCHEMA transport_private CASCADE; --"]};
const select={id:await queryId('SELECT value FROM settings WHERE id = ?'),args:['company']};
const result=JSON.parse(psql('SET ROLE service_role;'+rpc([insert,select])));
assert.equal(result[0].meta.changes,1);assert.equal(result[1].results[0].value,insert.args[1],'parameters remain literal values');
for(const role of ['anon','authenticated']){
 assert.throws(()=>psql(`SET ROLE ${role};SELECT * FROM transport_private.settings;`));
 assert.throws(()=>psql(`SET ROLE ${role};`+rpc([select])));
}
assert.throws(()=>psql('SET ROLE service_role;'+rpc([{id:'arbitrary SQL',args:[]}])));
assert.throws(()=>psql('SET ROLE service_role;'+rpc([{id:insert.id,args:[{},'value']}])));
assert.throws(()=>psql('SET ROLE service_role;'+rpc([{id:insert.id,args:['bad-count']}])));
assert.throws(()=>psql('SET ROLE service_role;'+rpc([{...insert,args:['rollback-me','first']},{...insert,args:['rollback-me','duplicate']}])), 'transaction fails on duplicate');
assert.equal(psql("SELECT count(*) FROM transport_private.settings WHERE id='rollback-me';"),'0','batch is atomic');
assert.equal(psql("SELECT count(*) FROM pg_tables WHERE schemaname='transport_private' AND rowsecurity;"),'10');
console.log('PostgreSQL checks passed: private tables, denied browser roles, fixed query whitelist, literal parameter binding, input validation and transactional rollback.');
