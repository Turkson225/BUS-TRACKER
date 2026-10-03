import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';
let clock=Date.parse('2026-10-03T06:10:00Z');const submitted=[];
const mf=await testRuntime({clock:true,bindings:{EMAIL_RELAY_URL:'https://script.google.com/macros/s/TestRelay/exec',EMAIL_RELAY_SECRET:'x'.repeat(64)},outboundService:async request=>{const data=await request.json();assert.equal(new URL(request.url).hostname,'script.google.com');assert.equal(data.secret,'x'.repeat(64));submitted.push(data);return Response.json({ok:true,eventId:data.eventId});}});
try{
 const db=await mf.getD1Database('DB');
 async function call(who,body=null,status=200){clock+=6000;const res=await mf.dispatchFetch('https://pilot.test/api/transport',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':who+'@example.test','x-test-clock':String(clock),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await res.json();assert.equal(res.status,status,JSON.stringify({body,data}));return data;}
 async function settled(){for(let i=0;i<50;i++){const n=await db.prepare("SELECT count(*) AS n FROM alerts WHERE email_state IN ('pending','sending')").first();if(!n.n)return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Email queue did not settle');}
 await call('admin',{action:'setup',company:'Recorded route tests'});
 for(const who of ['on','off','future','optout'])await call('admin',{action:'member',member:{email:who+'@example.test',name:who,role:'worker'}});
 await call('admin',{action:'member',member:{email:'driver@example.test',name:'Next driver',role:'driver'}});
 const recording=(await call('admin',{action:'recording-start',name:'U-shaped actual road'})).recording;
 // Dense route fixture: a detour puts the worker nearby in a straight line,
 // while the real travel distance is still over six kilometres.
 const vertices=[{lat:4.9,lng:-1.7},{lat:4.92,lng:-1.7},{lat:4.92,lng:-1.68},{lat:4.9,lng:-1.68},{lat:4.9,lng:-1.69}],trail=[];
 for(let j=1;j<vertices.length;j++){const a=vertices[j-1],b=vertices[j],n=j===4?10:20;for(let i=0;i<n;i++){const f=i/n;trail.push({lat:a.lat+(b.lat-a.lat)*f,lng:a.lng+(b.lng-a.lng)*f,accuracy:10,capturedAt:recording.createdAt+trail.length*10000});}}
 trail.push({...vertices.at(-1),accuracy:10,capturedAt:recording.createdAt+trail.length*10000});clock=trail.at(-1).capturedAt;
 await call('admin',{action:'recording-append',recordingId:recording.id,expectedCount:0,points:trail});await call('admin',{action:'recording-review',recordingId:recording.id});
 const rid=(await call('admin',{action:'recording-save',recordingId:recording.id,name:'U-shaped actual road'})).routeId;
 await call('admin',{action:'bus',bus:{id:'bus',name:'Company bus',plate:'TEST',routeId:rid}});
 for(const who of ['on','off','future','optout']){
  await call(who,{action:'pickup',pickup:{lat:4.9,lng:-1.68,name:'South junction',radius:3000,emailArrival:who!=='optout'}});
  await call(who,{action:'shift',shift:{date:who==='future'?'2026-10-04':'2026-10-03',busId:'bus',routeId:rid,usePickup:true,onShift:who!=='off',radius:3000,emailArrival:who!=='optout'}});
 }
 assert.equal((await call('on')).emailReady,true);assert.ok((await call('on')).pickup.offset>6000);
 let duty='admin',epoch=0;const tid=(await call(duty,{action:'start',busId:'bus',test:false})).tripId;
 async function location(lat,lng,accuracy=10){await call(duty,{action:'location',tripId:tid,driverEpoch:epoch,lat,lng,accuracy,speed:0,capturedAt:clock+6000});await settled();}
 await location(4.9,-1.7);assert.equal((await call('on')).alerts.length,0,'a nearby straight-line distance must not shortcut the recorded detour');
 await location(4.92,-1.68);assert.equal((await call('on')).alerts[0].kind,'approaching');assert.equal(submitted.length,0,'approaching creates phone alerts without arrival email');
 const progress=(await call(duty)).trips[0].routeProgress;
 await location(4.9,-1.68,2000);assert.equal((await call('on')).alerts.length,1);assert.equal((await call(duty)).trips[0].routeProgress,progress,'weak GPS cannot advance route progress');
 await call(duty,{action:'offer-handover',tripId:tid,driverEpoch:epoch,email:'driver@example.test'});
 await call('driver',{action:'accept-handover',tripId:tid,driverEpoch:1,lat:4.92,lng:-1.68,accuracy:10,speed:0,capturedAt:clock+6000});duty='driver';epoch=2;
 assert.equal((await call(duty)).trips[0].routeProgress,progress);assert.equal((await call('on')).alerts.length,1);
 await location(4.897,-1.68);assert.equal((await call('on')).alerts.length,1,'off-route GPS suppresses custom pickup alerts');
 await location(4.9,-1.68,70);assert.equal((await call('on')).alerts.length,1,'arrival requires accurate GPS');
 await location(4.9,-1.68,40);const on=await call('on');assert.equal(on.alerts.length,2);assert.equal(on.alerts.find(a=>a.kind==='arrived').emailState,'sent');assert.equal(submitted.length,1);assert.equal(submitted[0].to,'on@example.test');assert.ok(submitted[0].body.includes('South junction'));
 assert.equal((await call('off')).alerts.length,0);assert.equal((await call('future')).alerts.length,0);assert.equal((await call('optout')).alerts.length,2);assert.equal((await call('optout')).alerts.find(a=>a.kind==='arrived').emailState,'not-requested');
 await location(4.9,-1.68);assert.equal(submitted.length,1);
 await call(duty,{action:'offer-handover',tripId:tid,driverEpoch:epoch,email:'admin@example.test'});await call('admin',{action:'accept-handover',tripId:tid,driverEpoch:3,lat:4.9,lng:-1.68,accuracy:10,speed:0,capturedAt:clock+6000});duty='admin';epoch=4;await settled();assert.equal(submitted.length,1,'multiple handovers never repeat arrival email');
 await location(4.9,-1.69);assert.equal((await call('on')).alerts.length,2,'passed custom pickup points do not re-alert');
 await call(duty,{action:'end',tripId:tid,driverEpoch:epoch});
 const route=(await call('admin')).routes.find(r=>r.id===rid);await call('admin',{action:'route',route:{id:rid,name:'Updated route',color:route.color,stops:route.stops}});
 await call('on',{action:'shift',shift:{date:'2026-10-03',busId:'bus',routeId:rid,usePickup:true,onShift:true,radius:3000,emailArrival:true}},400);
 const second=(await call('admin',{action:'start',busId:'bus',test:false})).tripId;await call('admin',{action:'location',tripId:second,driverEpoch:0,lat:4.9,lng:-1.68,accuracy:10,speed:0,capturedAt:clock+6000});await settled();assert.equal(submitted.length,1,'old route revisions cannot email workers');
 await call('admin',{action:'end',tripId:second,driverEpoch:0});
 await call('on',{action:'pickup',pickup:{lat:4.9,lng:-1.68,name:'South junction',radius:3000,emailArrival:true}});await call('on',{action:'shift',shift:{date:'2026-10-03',busId:'bus',routeId:rid,usePickup:true,onShift:true,radius:3000,emailArrival:true}});
 const test=(await call('admin',{action:'start',busId:'bus',test:true})).tripId;await call('admin',{action:'location',tripId:test,driverEpoch:0,lat:4.9,lng:-1.68,accuracy:10,speed:0,capturedAt:clock+6000});await settled();assert.equal(submitted.length,1,'test GPS never sends worker emails');
 console.log('Recorded-route checks passed: detour distance, saved pickup pins, GPS quality and corridor checks, progress across handovers, arrival email targeting/opt-out, revision changes and test isolation. Email provider was mocked; no real messages sent.');
}finally{await mf.dispose();}
