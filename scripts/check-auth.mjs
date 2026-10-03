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
 const db=new SQLiteDatabase();const handler=createHandler(env,{database:db});
 assert.equal((await handler(new Request(origin,{method:'OPTIONS',headers:{origin}}))).headers.get('access-control-allow-origin'),origin);
 assert.equal((await handler(new Request(origin,{method:'OPTIONS',headers:{origin:'https://attacker.test'}}))).status,403);
 assert.equal((await handler(new Request(origin,{method:'DELETE'}))).status,405);
 assert.equal((await handler(new Request(origin,{headers:{'oai-authenticated-user-id':'admin','oai-authenticated-user-email':'admin@example.test'}}))).status,401);
 db.native.close();
 console.log('Clerk authentication checks passed: valid RSA signatures, issuer, expiry, authorized origin, session status, verified email, banned accounts, forged tokens, header spoofing, caching and CORS. No live Clerk account was used.');
} finally {globalThis.fetch=originalFetch;}
