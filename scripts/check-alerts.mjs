import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';
let clock=Date.parse('2026-10-03T06:30:00Z');
const mf=await testRuntime({clock:true});
try{const db=await mf.getD1Database('DB');
async function call(who,body=null,status=200){clock+=6000;if(body&&['location','end','next-stop','delay','offer-handover','cancel-handover','accept-handover'].includes(body.action))body={driverEpoch:0,...body};const res=await mf.dispatchFetch('https://pilot.test/api/transport',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test','x-test-clock':String(clock),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const v=await res.json();assert.equal(res.status,status,JSON.stringify(v));return v;}
await call('admin',{action:'setup',company:'Alert tests'});for(const who of ['on','off','other'])await call('admin',{action:'member',member:{email:who+'@example.test',name:who,role:'worker'}});
await call('admin',{action:'member',member:{email:'driver@example.test',name:'Next driver',role:'driver'}});
const route={id:'r',name:'Morning route',color:'#2168e8',stops:[{id:'a',name:'A',lat:4.9,lng:-1.7,time:'06:10'},{id:'b',name:'B',lat:4.92,lng:-1.7,time:'06:45'}]};await call('admin',{action:'route',route});await call('admin',{action:'bus',bus:{id:'bus',name:'Company bus',plate:'TEST',routeId:'r'}});
for(const who of ['on','off','other'])await call(who,{action:'shift',shift:{date:who==='other'?'2026-10-04':'2026-10-03',routeId:'r',busId:'bus',stopId:'a',onShift:who!=='off',radius:500}});
const tid=(await call('admin',{action:'start',busId:'bus',test:false})).tripId;
let duty='admin',driverEpoch=0;
async function location(lat,accuracy){await call(duty,{action:'location',tripId:tid,driverEpoch,lat,lng:-1.7,accuracy,speed:0,capturedAt:clock+6000});await mf.getD1Database('DB');}
await location(4.904,1000);assert.equal((await call('on')).alerts.length,0,'weak GPS suppresses alerts');
await location(4.904,10);let on=await call('on');assert.equal(on.alerts.length,1);assert.equal(on.alerts[0].kind,'approaching');assert.equal((await call('off')).alerts.length,0);assert.equal((await call('other')).alerts.length,0);
await location(4.904,10);assert.equal((await call('on')).alerts.length,1,'approaching event de-duplicated');
async function handover(next,lat){await call(duty,{action:'offer-handover',tripId:tid,driverEpoch,email:next+'@example.test'});const state=await call('on');assert.equal(state.trips[0].handoverName,next==='driver'?'Next driver':'admin@example.test');const accepted=await call(next,{action:'accept-handover',tripId:tid,driverEpoch:driverEpoch+1,lat,lng:-1.7,accuracy:10,speed:0,capturedAt:clock+6000});assert.equal(accepted.tripId,tid);duty=next;driverEpoch=accepted.driverEpoch;}
await handover('driver',4.904);assert.equal((await call('on')).alerts.length,1,'a driver swap does not repeat approaching alerts');
await handover('admin',4.904);assert.equal((await call('on')).alerts.length,1,'multiple swaps preserve alert identity');

await location(4.9,10);on=await call('on');assert.equal(on.alerts.length,2);assert.ok(on.alerts.some(a=>a.kind==='arrived'));
await call('admin',{action:'next-stop',tripId:tid,driverEpoch,nextStop:1});await location(4.9,10);assert.equal((await call('on')).alerts.length,2,'passed stops do not re-alert');
await call('admin',{action:'delay',tripId:tid,driverEpoch,minutes:5});assert.equal((await call('on')).alerts.length,3);assert.equal((await call('off')).alerts.length,0);
await handover('driver',4.9);assert.equal((await call('driver')).trips[0].nextStop,1);assert.equal((await call('driver')).trips[0].delayMinutes,5);await call('driver',{action:'delay',tripId:tid,driverEpoch,minutes:5});assert.equal((await call('on')).alerts.length,3,'handover preserves completed-stop and delay de-duplication');await call('admin',{action:'location',tripId:tid,driverEpoch:4,lat:4.9,lng:-1.7,accuracy:10,speed:0,capturedAt:clock+6000},409);
clock=Date.parse('2026-10-03T08:01:00Z');await call(duty,{action:'location',tripId:tid,driverEpoch,lat:4.91,lng:-1.7,accuracy:10,speed:0,capturedAt:clock+6000},409);assert.equal((await call('admin')).trips.length,0);
console.log('Arrival policy checks passed: morning window, weak GPS suppression, approaching + at-stop alerts, off-shift and other-date exclusion, de-duplication across multiple driver swaps, completed stops, delay targeting and 08:00 cutoff.');
}finally{await mf.dispose();}
