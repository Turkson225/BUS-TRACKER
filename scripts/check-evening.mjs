import assert from 'node:assert/strict';
import {testRuntime} from './test-runtime.mjs';
import {inServiceWindow} from '../supabase/functions/transport/core/transport.ts';
let clock=Date.parse('2026-10-04T17:00:00Z'),checks=0,emails=[];
const mf=await testRuntime({clock:true,bindings:{EMAIL_RELAY_URL:'https://script.google.com/macros/s/TEST/exec',EMAIL_RELAY_SECRET:'a'.repeat(32)},outboundService:async req=>{const b=await req.json();emails.push(b);return Response.json({ok:true,eventId:b.eventId});}});
try{
const db=await mf.getD1Database();
async function call(who,body=null,status=200){clock+=6000;const res=await mf.dispatchFetch('https://pilot.test/api/transport',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':who,'oai-authenticated-user-email':`${who}@example.test`,'x-test-clock':String(clock),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await res.json();assert.equal(res.status,status,JSON.stringify({who,body,data,status:res.status}));checks++;return data;}
await call('admin',{action:'setup',company:'Evening company'});
for(const [who,role] of [['night','driver'],['other-driver','driver'],['worker','worker'],['off','worker']]){await call('admin',{action:'member',member:{email:`${who}@example.test`,name:who,role}});await call(who);}
const morning={id:'morning',name:'Morning pickup',color:'#7c3aed',stops:[{id:'a',name:'Pickup',lat:4.9,lng:-1.7,time:'06:00'},{id:'b',name:'Company',lat:4.92,lng:-1.7,time:'07:59'}]};
const evening={id:'evening',service:'evening',name:'Home route',color:'#22d3ee',stops:[{id:'c',name:'Company',lat:4.92,lng:-1.7,time:'18:00'},{id:'d',name:'Last home',lat:4.93,lng:-1.7,time:'20:59'}]};
await call('admin',{action:'route',route:morning});await call('admin',{action:'route',route:evening});
await call('admin',{action:'route',route:{...evening,id:'wrong-time',stops:morning.stops}},400);
await call('admin',{action:'bus',bus:{id:'bus',name:'Company bus',plate:'TEST',routeId:'morning',nightRouteId:'evening'}});
await call('worker',{action:'night-driver',email:'night@example.test'},403);await call('admin',{action:'night-driver',email:'worker@example.test'},400);await call('admin',{action:'night-driver',email:'night@example.test'});
await call('worker',{action:'pickup',pickup:{lat:4.9,lng:-1.7,name:'Morning point',radius:1000,emailArrival:true}});
await call('worker',{action:'home',home:{lat:4.93,lng:-1.7,name:'My home',radius:1000,emailArrival:true}});
const days=Array.from({length:7},(_,i)=>({date:`2026-10-${String(4+i).padStart(2,'0')}`,shiftLabel:'Day shift',onShift:i%2===0,morning:i%2===0,evening:i%2===0}));
await call('worker',{action:'weekly-shifts',name:'Worker submitted name',email:'forged@example.test',days});
const weekly=(await call('worker')).weekly;assert.equal(weekly.length,7);assert.equal(weekly.filter(d=>d.onShift).length,4,'multiple independent working days are saved in one submission');assert.deepEqual(weekly.filter(d=>d.onShift).map(d=>d.date),['2026-10-04','2026-10-06','2026-10-08','2026-10-10']);assert.ok(weekly.every(d=>d.email==='worker@example.test'));checks++;
assert.equal((await call('worker')).pickup.name,'Morning point');assert.equal((await call('worker')).home.name,'My home');checks++;
await call('worker',{action:'weekly-shifts',name:'Worker',days:days.map((d,i)=>i===1?{...d,date:days[0].date}:d)},400);
await call('worker',{action:'weekly-shifts',name:'Worker',days:days.map((d,i)=>i===1?{...d,morning:true}:d)},400);
await call('off',{action:'weekly-shifts',name:'Off shift',days:days.map(d=>({...d,onShift:false,morning:false,evening:false}))});
await call('worker',{action:'week-roster',start:'2026-10-04'},403);assert.equal((await call('admin',{action:'week-roster',start:'2026-10-04'})).days.length,14);
await call('worker',{action:'planned-passengers',service:'evening'},403);await call('other-driver',{action:'planned-passengers',service:'evening'},403);const plan=await call('night',{action:'planned-passengers',service:'evening'});assert.equal(plan.passengers.length,1);assert.equal(plan.passengers[0].name,'Worker submitted name');assert.equal(plan.passengers[0].shiftLabel,'Day shift');checks++;
await call('night',{action:'start',busId:'bus',service:'evening',test:false},400);
await call('other-driver',{action:'start',busId:'bus',service:'evening',test:true},403);
clock=Date.parse('2026-10-04T18:00:00Z');
const trip=(await call('night',{action:'start',busId:'bus',service:'evening',test:false})).tripId;
const state=await call('night');assert.equal(state.trips[0].service,'evening');assert.equal(state.passengers.length,1);assert.equal(state.passengers[0].destination,'My home');checks++;
assert.equal((await call('worker')).passengers.length,0);assert.equal((await call('other-driver')).passengers.length,0);assert.equal((await call('admin')).passengers.length,1);checks++;
await call('night',{action:'offer-handover',tripId:trip,driverEpoch:0,email:'other-driver@example.test'},403);
await call('admin',{action:'night-driver',email:'other-driver@example.test'},409);
await call('night',{action:'next-stop',tripId:trip,driverEpoch:0,nextStop:1},400);
async function fix(lat,accuracy=10,status=200){return call('night',{action:'location',tripId:trip,driverEpoch:0,lat,lng:-1.7,accuracy,speed:0,capturedAt:clock+6000},status);}
await fix(4.924,1000);assert.equal((await call('worker')).alerts.length,0);
await fix(4.924);assert.equal((await call('worker')).alerts[0].kind,'approaching');
await fix(4.93);assert.ok((await call('worker')).alerts.some(a=>a.kind==='arrived'));
await fix(4.93);assert.equal((await call('worker')).alerts.length,2);assert.equal((await call('off')).alerts.length,0);checks++;
// Flush background email claims through an additional request round-trip.
await new Promise(resolve=>setTimeout(resolve,20));assert.equal(emails.length,1);assert.equal(emails[0].to,'worker@example.test');assert.match(emails[0].body,/My home/);checks++;
await call('worker',{action:'trip-history',tripId:trip},403);assert.ok((await call('admin',{action:'trip-history',tripId:trip})).points.length>=3);checks++;
await call('other-driver',{action:'dropoff-complete',tripId:trip,driverEpoch:0,userId:'worker'},409);
await call('night',{action:'dropoff-complete',tripId:trip,driverEpoch:0,userId:'off'},400);
await call('night',{action:'dropoff-complete',tripId:trip,driverEpoch:0,userId:'worker'});assert.equal((await call('night')).passengers[0].delivered,true);
await fix(4.93);assert.equal((await call('worker')).alerts.length,2);checks++;
clock=Date.parse('2026-10-04T21:00:00Z');await fix(4.93,10,409);
assert.equal((await call('admin')).trips.length,0);
for(const [iso,service,expected] of [['2026-10-04T06:00:00Z','morning',true],['2026-10-04T08:00:00Z','morning',false],['2026-10-04T18:00:00Z','evening',true],['2026-10-04T21:00:00Z','evening',false]]){assert.equal(inServiceWindow(service,new Date(iso)),expected);checks++;}
// Test trips still record GPS but must never notify workers.
const testTrip=(await call('night',{action:'start',busId:'bus',service:'evening',test:true})).tripId;
await call('night',{action:'location',tripId:testTrip,driverEpoch:0,lat:4.93,lng:-1.7,accuracy:10,speed:0,capturedAt:clock+6000});
assert.equal((await call('worker')).alerts.length,2);checks++;
await call('night',{action:'end',tripId:testTrip,driverEpoch:0});
// Evening admin recordings become evening routes with evening times.
const draft=(await call('admin',{action:'recording-start',name:'Recorded night route',service:'evening'})).recording;
const created=clock;
await call('admin',{action:'recording-append',recordingId:draft.id,expectedCount:0,points:[{lat:4.93,lng:-1.7,accuracy:10,capturedAt:created},{lat:4.932,lng:-1.7,accuracy:10,capturedAt:created+5000}]});
await call('admin',{action:'recording-review',recordingId:draft.id});await call('admin',{action:'recording-save',recordingId:draft.id,name:'Recorded night route'});
const saved=(await call('admin')).routes.find(r=>r.id===draft.id);assert.equal(saved.service,'evening');assert.equal(saved.stops[0].time,'18:00');assert.equal(saved.stops.at(-1).time,'20:59');checks++;
console.log(`${checks} Evening/weekly checks passed: separate home points, verified emails, atomic weekly submission, one night driver, roster privacy, drop-off confirmation, trail history, approach/arrival emails, deduplication, off-shift exclusion and 21:00 cutoff.`);
}finally{await mf.dispose();}
