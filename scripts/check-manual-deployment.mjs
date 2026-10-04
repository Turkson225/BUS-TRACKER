import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { psql, sqlQuote } from './test-runtime.mjs';

const sql = await readFile(new URL('../deployment/manual/setup.sql', import.meta.url), 'utf8');
if (process.env.DATABASE_URL) {
  const baseline = await readFile(new URL('../supabase/migrations/20261003200000_transport.sql', import.meta.url), 'utf8');
  const upgrade = await readFile(new URL('../deployment/manual/upgrade-worker-sections.sql', import.meta.url), 'utf8');
  psql("DROP FUNCTION IF EXISTS public.transport_execute(jsonb); DROP SCHEMA IF EXISTS transport_private CASCADE; CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY); DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261003200000','20261004120000');");
  psql(baseline);
  psql("INSERT INTO transport_private.settings (id,value) VALUES ('company','Existing company'); INSERT INTO transport_private.members (email,name,role) VALUES ('worker@example.test','Existing worker','worker');");
  assert.throws(() => psql(upgrade.replace('COMMIT;', 'SELECT 1/0; COMMIT;')), 'failed upgrade must roll back');
  assert.equal(psql("SELECT count(*) FROM information_schema.columns WHERE table_schema='transport_private' AND table_name='members' AND column_name='section';"), '0');
  psql(upgrade);
  assert.equal(psql("SELECT value FROM transport_private.settings WHERE id='company';"), 'Existing company');
  assert.equal(psql("SELECT name FROM transport_private.members WHERE email='worker@example.test';"), 'Existing worker');
  assert.throws(() => psql(upgrade), 'repeated upgrade must preserve existing data');
  assert.equal(psql("SELECT count(*) FROM transport_private.members;"), '1');
  // The previous backend's operation registry still works after the upgrade.
  const { queryId } = await import('../supabase/functions/transport/core/postgres.ts');
  const operation = { id: await queryId('SELECT email,name,role FROM members ORDER BY role,name'), args: [] };
  assert.equal(JSON.parse(psql('SET ROLE service_role; SELECT public.transport_execute(' + sqlQuote(JSON.stringify([operation])) + '::jsonb);'))[0].results[0].name, 'Existing worker');
  // DATABASE_URL is the same isolated, disposable PostgreSQL fixture used by the other tests.
  psql("DROP FUNCTION IF EXISTS public.transport_execute(jsonb); DROP SCHEMA IF EXISTS transport_private CASCADE; DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20261003200000','20261004120000');");
  assert.throws(() => psql(sql.replace('COMMIT;', 'SELECT 1/0; COMMIT;')), 'a failed installation must abort');
  assert.equal(psql("SELECT count(*) FROM pg_namespace WHERE nspname='transport_private';"), '0', 'failed installation leaves no transport schema');
  assert.equal(psql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261003200000';"), '0', 'failed installation is not recorded');
  psql(sql);
  assert.equal(psql("SELECT count(*) FROM pg_tables WHERE schemaname='transport_private' AND rowsecurity;"), '10');
  assert.equal(psql("SELECT name FROM supabase_migrations.schema_migrations WHERE version='20261003200000';"), 'transport');
  assert.equal(psql("SELECT name FROM supabase_migrations.schema_migrations WHERE version='20261004120000';"), 'worker_sections');
  psql("INSERT INTO transport_private.settings (id,value) VALUES ('manual-fixture','keep this record');");
  assert.throws(() => psql(sql), 'rerunning must not overwrite installed tables');
  assert.equal(psql("SELECT value FROM transport_private.settings WHERE id='manual-fixture';"), 'keep this record');
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => psql(`SET ROLE ${role}; SELECT * FROM transport_private.settings;`));
    assert.throws(() => psql(`SET ROLE ${role}; SELECT public.transport_execute('[]'::jsonb);`));
  }
} else console.log('Manual SQL transaction checks run against the isolated PostgreSQL fixture in GitHub Actions.');

const origin = 'https://manual-fixture.test', issuer = 'https://manual-auth.clerk.accounts.dev';
const env = { APP_ORIGIN: origin, CLERK_ISSUER: issuer, CLERK_SECRET_KEY: 'test-only-clerk', ADMIN_EMAIL: 'admin@example.test', SUPABASE_URL: 'https://manual-database.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service' };
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'manual-signing-key' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(patch = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = encode({ alg: 'RS256', kid: jwk.kid });
  const body = encode({ iss: issuer, sub: 'user_ManualAdmin', sid: 'sess_Manual', azp: origin, iat: now, nbf: now - 1, exp: now + 60, ...patch });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(signature).toString('base64url')}`;
}
const originals = { fetch: globalThis.fetch, Deno: globalThis.Deno, EdgeRuntime: globalThis.EdgeRuntime };
let handler, databaseRequests = 0;
try {
  globalThis.Deno = { env: { toObject: () => env }, serve: value => { handler = value; } };
  globalThis.EdgeRuntime = { waitUntil: promise => { void promise; } };
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [jwk] });
    if (request.url === 'https://api.clerk.com/v1/users/user_ManualAdmin') {
      assert.equal(request.headers.get('authorization'), 'Bearer test-only-clerk');
      return Response.json({ id: 'user_ManualAdmin', primary_email_address_id: 'primary', email_addresses: [{ id: 'primary', email_address: env.ADMIN_EMAIL, verification: { status: 'verified' } }] });
    }
    assert.equal(request.url, `${env.SUPABASE_URL}/rest/v1/rpc/transport_execute`);
    assert.equal(request.headers.get('apikey'), env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(request.headers.get('authorization'), `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    databaseRequests++;
    const { operations } = await request.json();
    if (process.env.DATABASE_URL) return Response.json(JSON.parse(psql('SET ROLE service_role; SELECT public.transport_execute(' + sqlQuote(JSON.stringify(operations)) + '::jsonb);')));
    return Response.json(operations.map(() => ({ results: [], meta: { changes: 0 } })));
  };
  // Import the exact file users paste, without importing the original handler or injecting identities.
  await import('../deployment/manual/transport.ts');
  assert.equal(typeof handler, 'function');
  const call = (headers = {}, options = {}) => handler(new Request(`${env.SUPABASE_URL}/functions/v1/transport`, { headers: { origin, ...headers }, ...options }));
  assert.equal((await call()).status, 401);
  assert.equal((await call({ 'oai-authenticated-user-id': 'user_ManualAdmin', 'oai-authenticated-user-email': env.ADMIN_EMAIL })).status, 401);
  assert.equal((await call({ origin: 'https://another-site.test' })).status, 403);
  assert.equal((await call({ authorization: 'Bearer ' + await token({ exp: 0 }) })).status, 401);
  assert.equal(databaseRequests, 0, 'rejected requests cannot access the database');
  const preflight = await call({}, { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  const authorization = 'Bearer ' + await token();
  const response = await call({ authorization });
  assert.equal(response.status, 200);
  const initial = await response.json();
  assert.equal(initial.configured, false);
  assert.equal(initial.user.email, env.ADMIN_EMAIL);
  assert.ok(databaseRequests > 0, 'verified Clerk session reaches the server-only RPC');
  const setup = await call({ authorization }, { method: 'POST', body: JSON.stringify({ action: 'setup', company: 'Manual deployment fixture' }) });
  assert.equal(setup.status, 200);
  if (process.env.DATABASE_URL) {
    const saved = await (await call({ authorization })).json();
    assert.equal(saved.configured, true);
    assert.equal(saved.company, 'Manual deployment fixture');
    assert.equal(saved.user.role, 'admin');
  }
  console.log('Dashboard backend checks passed: actual bundled entrypoint, RSA Clerk sign-in, rejection before database access, CORS and administrator setup. PostgreSQL CI also checks atomic installation, rerun protection and persistence.');
} finally {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
}
