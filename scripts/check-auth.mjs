import assert from 'node:assert/strict';
import { authenticate } from '../supabase/functions/transport/core/auth.ts';
import { createHandler } from '../supabase/functions/transport/handler.ts';
import { SQLiteDatabase } from './test-runtime.mjs';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-signing-key',alg:'RS256',use:'sig'};
const issuer='https://auth-test.clerk.accounts.dev',origin='https://pilot.test';
const env={CLERK_ISSUER:issuer,CLERK_SECRET_KEY:'test-only-secret',APP_ORIGIN:origin,ADMIN_EMAIL:'admin@example.test'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const defaults=()=>({iss:issuer,sub:'user_Admin',sid:'sess_Morning',azp:origin,iat:Math.floor(Date.now()/1000),nbf:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+60});
async function token(overrides={},header={}){const h=encode({alg:'RS256',kid:jwk.kid,...header}),p=encode({...defaults(),...overrides});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(sig).toString('base64url');}
const originalFetch=globalThis.fetch;let requests=0,profile={id:'user_Admin',primary_email_address_id:'email_primary',email_addresses:[{id:'email_primary',email_address:'Admin@example.test',verification:{status:'verified'}}],first_name:'Transport',last_name:'Admin'};
globalThis.fetch=async(input,init)=>{requests++;const request=new Request(input,init);if(request.url===issuer+'/.well-known/jwks.json')return Response.json({keys:[jwk]});assert.ok(request.url.startsWith('https://api.clerk.com/v1/users/'));assert.equal(request.headers.get('authorization'),'Bearer test-only-secret');return Response.json(profile);};
try {
 const user=await authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token()}}),env);
 assert.equal(user.email,'admin@example.test');assert.equal(user.displayName,'Transport Admin');assert.equal(requests,2);
 await authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token()}}),env);assert.equal(requests,2,'JWKS and verified profiles are cached briefly');
 for(const override of [{iss:'https://attacker.test'},{azp:'https://attacker.test'},{azp:null},{exp:0},{exp:'9999999999'},{nbf:Date.now()/1000+1000},{iat:Date.now()/1000+1000},{sts:'pending'},{sub:'../../admin'},{sid:null}]){
  await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token(override)}}),env),error=>error.status===401);
 }
 await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token({}, {alg:'none'})}}),env),error=>error.status===401);
 const genuine=await token();const forged=genuine.split('.');forged[1]=encode({...defaults(),sub:'user_Attacker',email:'admin@example.test',role:'admin'});
 await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+forged.join('.')}}),env),error=>error.status===401);
 await assert.rejects(authenticate(new Request(origin,{headers:{'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'admin@example.test'}}),env),error=>error.status===401);
 for(const [id,patch] of [['user_Unverified',{email_addresses:[{id:'email_primary',email_address:'admin@example.test',verification:{status:'unverified'}}]}],['user_Banned',{banned:true}],['user_Locked',{locked:true}]]){
  profile={...profile,id,...patch};
  await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token({sub:id})}}),env),error=>error.status===403);
 }
 // Provider outages and a mismatched server key give actionable setup errors,
 // without changing authentication or exposing key material.
 globalThis.fetch=async()=>{throw new TypeError('Fixture network outage');};
 await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token({sub:'user_Network'})}}),env),error=>error.status===503&&error.message.includes('could not reach'));
 for(const status of [401,403]){
  globalThis.fetch=async()=>new Response('',{status});
  await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token({sub:'user_BadKey'+status})}}),env),error=>error.status===503&&error.message.includes('Clerk secret key'));
 }
 const unreachable='https://unreachable.clerk.accounts.dev';
 globalThis.fetch=async()=>{throw new TypeError('Fixture JWKS outage');};
 await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token({iss:unreachable})}}),{...env,CLERK_ISSUER:unreachable}),error=>error.status===503&&error.message.includes('could not reach Clerk'));
 const db=new SQLiteDatabase();const handler=createHandler(env,{database:db});
 const validToken=await token();
 const oldConsoleError=console.error,diagnosticLogs=[];
 console.error=(...parts)=>diagnosticLogs.push(parts.join(' '));
 try {
  for(const invalidIssuer of ['auth-test.clerk.accounts.dev','pk_test_not_a_url','"https://auth-test.clerk.accounts.dev"','http://auth-test.clerk.accounts.dev',issuer+'/v1',issuer+'?secret=never-log-this',issuer.replace('https://','https://private:password@')]){
   const invalidHandler=createHandler({...env,CLERK_ISSUER:invalidIssuer},{database:db});
   const response=await invalidHandler(new Request(origin,{headers:{authorization:'Bearer '+validToken}}));
   assert.equal(response.status,503);
   assert.match((await response.json()).error,/CLERK_ISSUER/,'malformed issuer gives an actionable configuration error');
   assert.equal(response.headers.get('x-onroute-backend'),'20261004-auth-diagnostics');
  }
  assert.ok(diagnosticLogs.every(log=>log.includes('sign-in-settings')));
  assert.ok(!diagnosticLogs.join('\n').includes('never-log-this'));
  assert.ok(!diagnosticLogs.join('\n').includes('private:password'));
  const unexpected=createHandler(env,{database:db,authenticate:async()=>{throw new TypeError('secret test value must not be logged: '+validToken);}});
  const failure=await unexpected(new Request(origin));
  assert.equal(failure.status,503);
  const reference=(await failure.json()).error.split('Reference: ')[1];
  assert.match(reference,/^[a-f0-9-]{36}$/);
  const record=JSON.parse(diagnosticLogs.at(-1).slice('Transport handler failed '.length));
  assert.equal(record.reference,reference);assert.equal(record.stage,'authentication');assert.equal(record.errorType,'TypeError');
  assert.ok(!diagnosticLogs.join('\n').includes(validToken),'diagnostics never log the raw error or bearer token');
 } finally {console.error=oldConsoleError;}
 for(const [subject,payload] of [['user_BadJson','not JSON'],['user_BadShape',JSON.stringify({email_addresses:{}})]]){
  globalThis.fetch=async()=>new Response(payload);
  await assert.rejects(authenticate(new Request(origin,{headers:{authorization:'Bearer '+await token({sub:subject})}}),env),error=>error.status===503&&error.message.includes('account response'));
 }
 assert.equal((await handler(new Request(origin,{method:'OPTIONS',headers:{origin}}))).headers.get('access-control-allow-origin'),origin);
 assert.equal((await handler(new Request(origin,{method:'OPTIONS',headers:{origin:'https://attacker.test'}}))).status,403);
 assert.equal((await handler(new Request(origin,{method:'DELETE'}))).status,405);
 assert.equal((await handler(new Request(origin,{headers:{'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'admin@example.test'}}))).status,401);
 db.native.close();
 console.log('Clerk authentication checks passed: valid RSA signatures, issuer, expiry, authorized origin, session status, verified email, banned accounts, forged tokens, header spoofing, caching and CORS. No live Clerk account was used.');
} finally {globalThis.fetch=originalFetch;}
