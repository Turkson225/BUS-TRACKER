import { database,runtime,getAuthenticatedUser,waitUntil,type Database as D1Database,type Result as D1Result,type Statement as D1PreparedStatement } from './context.ts';
import { dateInAccra, inPickupWindow, inServiceWindow, remainingDistance, distance, routePath, projectPoint, progressAt, pickupDistance, type Route, type Trip } from './transport.ts';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { z } from 'zod';
export const dynamic='force-dynamic';
import { AppError } from './errors.ts';
import { recordingAction,castRecording } from './recordings.ts';
import { serviceAction,castHome,castWeekly,roster } from './service.ts';
import { emailReady,sendEmail,deliverEmails } from './email.ts';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const id=z.string().min(1).max(100);
const str=z.string().trim().min(1).max(100);
const epoch=z.number().int().nonnegative();
const radius=z.union([z.literal(500),z.literal(1000),z.literal(1500),z.literal(2000),z.literal(3000),z.literal(5000)]);
const locationSchema=z.object({lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),accuracy:z.number().min(0).max(50000),speed:z.number().min(0).max(100).nullable(),capturedAt:z.number()});
function freshLocation(b:unknown){const v=locationSchema.parse(b);if(Math.abs(Date.now()-v.capturedAt)>30000)throw new AppError('GPS fix is outdated. Waiting for a fresh location.');return v;}
async function activeWindow(t:Trip,db:D1Database){if(t.date!==dateInAccra()||(!t.test&&!inServiceWindow(t.service))||(t.test&&Date.now()-t.startedAt>7200000)){await db.prepare('UPDATE trips SET status=?,handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1 WHERE id=? AND status=? AND driver_epoch=?').bind('ended',t.id,'active',t.driverEpoch).run();throw new AppError('The trip window has ended. Location sharing is now stopped.',409);}}
async function expireTrips(db:D1Database){const active=await db.prepare('SELECT * FROM trips WHERE status=?').bind('active').all<any>();for(const row of active.results){const t=castTrip(row);if(t.date!==dateInAccra()||(!t.test&&!inServiceWindow(t.service))||(t.test&&Date.now()-t.startedAt>7200000))await db.prepare('UPDATE trips SET status=? WHERE id=? AND status=? AND driver_epoch=?').bind('ended',t.id,'active',t.driverEpoch).run();}}
function checkEpoch(t:Trip,b:any){if(epoch.parse(b.driverEpoch)!==t.driverEpoch)throw new AppError('Driver duty has changed. Refresh before continuing.',409);}
function changed(result:D1Result){if(!result.meta.changes)throw new AppError('Driver duty has changed. Refresh before continuing.',409);}
const stop=z.object({id,name:str,lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),time:z.string().regex(/^(?:0[67]|1[8-9]|20):[0-5]\d$/)});
const routeSchema=z.object({id:id.optional(),name:str,color:z.string().regex(/^#[0-9a-fA-F]{6}$/),stops:z.array(stop).min(2).max(50),service:z.enum(['morning','evening']).default('morning')});
const castTrip=(r:any):Trip=>({service:r.service??'morning',id:r.id,busId:r.bus_id,routeId:r.route_id,driverId:r.driver_id,driverName:r.driver_name,date:r.date,status:r.status,test:r.test,nextStop:r.next_stop,lat:r.lat,lng:r.lng,accuracy:r.accuracy,speed:r.speed,updatedAt:r.updated_at,startedAt:r.started_at,delayMinutes:r.delay_minutes,driverEpoch:r.driver_epoch,handoverEmail:r.handover_email,handoverName:r.handover_name,routeProgress:r.route_progress});
const castRoute=(r:any):Route=>({...r,stops:JSON.parse(r.stops),path:JSON.parse(r.path??'[]')});
async function identity(){const u=await getAuthenticatedUser();if(!u)throw new AppError('Sign in to use company transport.',401);const db=database();const config=await db.prepare('SELECT value FROM settings WHERE id = ?').bind('company').first<{value:string}>();const m=await db.prepare('SELECT * FROM members WHERE email = ?').bind(u.email.toLowerCase()).first<any>();if(!config&&u.email.toLowerCase()!==runtime().ADMIN_EMAIL?.toLowerCase())throw new AppError('Only the configured administrator can set up the company.',403);if(config&&!m)throw new AppError('Your email has not been added to the company. Ask the transport administrator to add you.',403);if(m&&m.user_id!==u.userId)await db.prepare('UPDATE members SET user_id=? WHERE email=?').bind(u.userId,u.email.toLowerCase()).run();return {u,db,config,m};}
function admin(m:any){if(m?.role!=='admin')throw new AppError('Only the transport administrator can do this.',403);}
async function getRoute(db:D1Database,rid:string){const row=await db.prepare('SELECT * FROM routes WHERE id = ?').bind(rid).first<any>();if(!row)throw new AppError('Route not found.');return castRoute(row);}
async function ownTrip(db:D1Database,tid:string,uid:string){const row=await db.prepare('SELECT * FROM trips WHERE id = ? AND driver_id = ? AND status = ?').bind(tid,uid,'active').first<any>();if(!row)throw new AppError('This trip is no longer active or belongs to another driver.',409);return castTrip(row);}
async function push(db:D1Database,uid:string,payload:{title:string;body:string;tag:string}){const e=runtime();if(!e.VAPID_SERVER_PRIVATE_KEY||!e.VAPID_SERVER_PUBLIC_KEY||!e.VAPID_SUBJECT)return 'unavailable';const subs=await db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(uid).all<any>();if(!subs.results.length)return 'not-enabled';let sent=false;for(const row of subs.results){try{const s=JSON.parse(row.subscription);const request=await buildPushPayload({data:JSON.stringify(payload),options:{ttl:120}},s,{subject:e.VAPID_SUBJECT,publicKey:e.VAPID_SERVER_PUBLIC_KEY,privateKey:e.VAPID_SERVER_PRIVATE_KEY});const res=await fetch(s.endpoint,{...request,signal:AbortSignal.timeout(5000)});if(res.status===404||res.status===410)await db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(row.endpoint).run();else if(res.ok)sent=true;}catch(error){console.error('Push delivery failed',String(error));}}return sent?'sent':'failed';}
async function deliver(db:D1Database,tid:string){const pending=await db.prepare('SELECT * FROM alerts WHERE trip_id = ? AND push_state IN (?, ?) AND attempts < 3 AND created_at > ? LIMIT 50').bind(tid,'pending','failed',Date.now()-120000).all<any>();for(let i=0;i<pending.results.length;i+=10){await Promise.allSettled(pending.results.slice(i,i+10).map(async a=>{const claim=await db.prepare('UPDATE alerts SET attempts = attempts + 1, push_state = ? WHERE id = ? AND attempts = ?').bind('sending',a.id,a.attempts).run();if(!claim.meta.changes)return;const s=await push(db,a.user_id,{title:a.title,body:a.body,tag:a.id});await db.prepare('UPDATE alerts SET push_state = ? WHERE id = ?').bind(s,a.id).run();}));}await deliverEmails(db,tid);}

const castShift=(s:any)=>s?{date:s.date,busId:s.bus_id,routeId:s.route_id,stopId:s.stop_id,onShift:s.on_shift,radius:s.radius,routeRevision:s.route_revision,emailArrival:s.email_arrival,pickup:s.pickup_lat!==null&&s.pickup_lng!==null?{lat:s.pickup_lat,lng:s.pickup_lng,name:s.pickup_name,offset:s.route_offset}:null}:null;
const castPickup=(s:any)=>s?{busId:s.bus_id,routeId:s.route_id,routeRevision:s.route_revision,lat:s.lat,lng:s.lng,name:s.name,offset:s.route_offset,radius:s.radius,emailArrival:s.email_arrival}:null;
async function createAlerts(db:D1Database,t:Trip,r:Route,busName:string){
 if(t.test||t.handoverName||!inServiceWindow(t.service)||t.date!==dateInAccra()||!t.updatedAt||Date.now()-t.updatedAt>30000||(t.accuracy??999)>100)return;
 if(t.service==='evening'){
  const workers=await db.prepare('SELECT n.*,m.email,d.delivered_at FROM night_bookings n JOIN members m ON m.user_id=n.user_id LEFT JOIN night_deliveries d ON d.trip_id=? AND d.user_id=n.user_id WHERE n.bus_id=? AND n.route_id=? AND n.date=? AND n.on_shift=1 AND m.role=?').bind(t.id,t.busId,t.routeId,t.date,'worker').all<any>();
  const statements:D1PreparedStatement[]=[];
  for(const w of workers.results){if(w.delivered_at)continue;const d=distance({lat:t.lat!,lng:t.lng!},w),at=d<=120&&(t.accuracy??999)<=60;
   const kind=at?'arrived':d<=w.radius?'approaching':null;if(!kind)continue;
   const title=at?`${busName} is near your home destination`:`Your home drop-off is approaching`,body=at?`The bus is near ${w.name}. Prepare to alight when the driver stops safely.`:`About ${Math.max(.1,d/1000).toFixed(1)} km straight-line distance to ${w.name}. Check with the driver before alighting.`;
   const mail=at&&w.email_arrival?w.email:null;
   statements.push(db.prepare('INSERT OR IGNORE INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,email_to,email_state) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),w.user_id,t.id,kind,title,body,Date.now(),'pending',mail,mail?(emailReady()?'pending':'not-configured'):'not-requested'));
  }
  if(statements.length)await db.batch(statements);waitUntil(deliver(db,t.id));return;
 }
 const workers=await db.prepare('SELECT s.*,m.email FROM shifts s LEFT JOIN members m ON m.user_id=s.user_id WHERE s.bus_id=? AND s.route_id=? AND s.date=? AND s.on_shift=1').bind(t.busId,t.routeId,t.date).all<any>();
 const statements:D1PreparedStatement[]=[];
 for(const w of workers.results){
  if(w.route_revision!==(r.revision??1))continue;
  let d:number|null=null,at=false,label='your pickup point';
  if(w.pickup_lat!==null&&w.pickup_lng!==null&&w.route_offset!==null){
   const p={lat:w.pickup_lat,lng:w.pickup_lng,name:w.pickup_name,offset:w.route_offset};
   d=pickupDistance(t,r,p);if(d===null)continue;label=p.name;
   at=d<=150&&distance({lat:t.lat!,lng:t.lng!},p)<=120&&(t.accuracy??999)<=60;
  }else{
   const idx=r.stops.findIndex(s=>s.id===w.stop_id);if(idx<t.nextStop||idx<0)continue;
   d=remainingDistance(t,r,idx);if(d===null)continue;label=r.stops[idx].name;
   at=idx===t.nextStop&&d<=120&&(t.accuracy??999)<=60;
  }
  const kind=at?'arrived':d<=w.radius?'approaching':null;if(!kind)continue;
  const title=at?`${busName} is at your pickup point`:`${busName} is approaching`;
  const body=at?`Head to ${label}. The bus is nearby.`:`About ${Math.max(.1,d/1000).toFixed(1)} km along the bus route to ${label}. Please get ready.`;
  const mail=at&&w.email_arrival&&w.email?w.email:null;
  statements.push(db.prepare('INSERT OR IGNORE INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,email_to,email_state) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),w.user_id,t.id,kind,title,body,Date.now(),'pending',mail,mail?(emailReady()?'pending':'not-configured'):'not-requested'));
 }
 if(statements.length)await db.batch(statements);waitUntil(deliver(db,t.id));
}
export async function GET(){try{
 const {u,db,config,m}=await identity(),today=dateInAccra();
 const [rr,bb,tt,shift,aa,mm,pp,recording]=await Promise.all([
  db.prepare('SELECT * FROM routes ORDER BY name').all<any>(),db.prepare('SELECT * FROM buses ORDER BY name').all<any>(),db.prepare('SELECT * FROM trips WHERE status=? AND date=?').bind('active',today).all<any>(),
  db.prepare('SELECT * FROM shifts WHERE user_id=? AND date=?').bind(u.userId,today).first<any>(),db.prepare('SELECT * FROM alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(u.userId).all<any>(),
  m?.role==='admin'?db.prepare('SELECT email,name,role,section FROM members ORDER BY role,section,name').all<any>():m?.role==='driver'?db.prepare("SELECT email,name,role,section FROM members WHERE role IN ('driver','admin') ORDER BY name").all<any>():Promise.resolve({results:[]}),
  db.prepare('SELECT * FROM pickups WHERE user_id=?').bind(u.userId).first<any>(),m?.role==='admin'?db.prepare("SELECT * FROM route_recordings WHERE owner_id=? AND status IN ('recording','review') LIMIT 1").bind(u.userId).first<any>():Promise.resolve(null)
 ]);
 const current=tt.results.map(castTrip).find(t=>(t.test&&Date.now()-t.startedAt<=7200000)||(!t.test&&inServiceWindow(t.service)));
 const [home,weekly,nightDriver,history]=await Promise.all([db.prepare('SELECT * FROM homes WHERE user_id=?').bind(u.userId).first<any>(),db.prepare('SELECT * FROM weekly_shifts WHERE user_id=? AND date>=? AND date<=? ORDER BY date').bind(u.userId,today,dateInAccra(new Date(Date.now()+31*86400000))).all<any>(),db.prepare('SELECT value FROM settings WHERE id=?').bind('night-driver').first<any>(),m?.role==='admin'?db.prepare('SELECT * FROM trips ORDER BY started_at DESC LIMIT 30').all<any>():Promise.resolve({results:[]})]);
 const visibleDuty=current&&(m?.role==='admin'||(m?.role==='driver'&&(current.driverId===u.userId||(current.service!=='evening'&&current.handoverEmail===u.email.toLowerCase()))))?current:null;
 const passengers=await roster(db,visibleDuty);
 return json({eveningReady:true,inEveningWindow:inServiceWindow('evening'),nightDriverEmail:['admin','driver'].includes(m?.role)?nightDriver?.value??null:null,home:castHome(home),weekly:weekly.results.map(castWeekly),passengers,tripHistory:history.results.map(castTrip),configured:!!config,company:config?.value??'Your company',today,inWindow:inPickupWindow(),user:{id:u.userId,name:m?.name??u.displayName,email:u.email,role:m?.role??'setup',section:m?.section??null},routes:rr.results.map(castRoute),buses:bb.results.map((b:any)=>({id:b.id,name:b.name,plate:b.plate,routeId:b.route_id,nightRouteId:b.night_route_id})),trips:tt.results.map(castTrip).map(t=>({...t,handoverEmail:['admin','driver'].includes(m?.role)?t.handoverEmail:null})).filter(t=>(t.test&&Date.now()-t.startedAt<=7200000)||(!t.test&&inServiceWindow(t.service))),shift:castShift(shift),alerts:aa.results.map((a:any)=>({id:a.id,title:a.title,body:a.body,createdAt:a.created_at,kind:a.kind,pushState:a.push_state,emailState:a.email_state})),members:mm.results,pickup:castPickup(pp),recording:recording?castRecording(recording):null,emailReady:emailReady(),vapidPublicKey:runtime().VAPID_SERVER_PUBLIC_KEY??null});
}catch(e){return handle(e);}}
export async function POST(req:Request){try{const origin=req.headers.get('origin');if(origin&&origin!==runtime().APP_ORIGIN)throw new AppError('Request origin is not allowed.',403);if(Number(req.headers.get('content-length')??0)>64000)throw new AppError('Request too large.',413);const raw=await req.text();if(raw.length>64000)throw new AppError('Request too large.',413);let b:any;try{b=JSON.parse(raw);}catch{throw new AppError('Request body must be valid JSON.');}const {u,db,config,m}=await identity();const action=z.string().parse(b.action);const today=dateInAccra();
if(action==='setup'){if(config)throw new AppError('Company is already configured.',409);const name=str.parse(b.company);await db.batch([db.prepare('INSERT INTO settings (id,value) VALUES (?,?)').bind('company',name),db.prepare('INSERT INTO members (email,user_id,name,role) VALUES (?,?,?,?)').bind(u.email.toLowerCase(),u.userId,u.displayName,'admin')]);return json({ok:true});}
if(!config||!m)throw new AppError('Set up the company first.',403);
if(action==='company'){admin(m);await db.prepare('UPDATE settings SET value = ? WHERE id = ?').bind(str.parse(b.company),'company').run();}
else if(action==='route'){admin(m);await expireTrips(db);const r=routeSchema.parse(b.route);if(new Set(r.stops.map(s=>s.id)).size!==r.stops.length||r.stops.some((s,i)=>(i>0&&s.time<r.stops[i-1].time)||!(r.service==='evening'?/^(?:1[89]|20):[0-5]\d$/:/^0[67]:[0-5]\d$/).test(s.time)))throw new AppError('Stop times must be in order within the selected service window.');const rid=r.id??crypto.randomUUID();const active=await db.prepare('SELECT id FROM trips WHERE route_id = ? AND status = ?').bind(rid,'active').first();if(active)throw new AppError('End active trips before editing this route.',409);await db.prepare('INSERT INTO routes (id,name,color,stops,service) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,stops=excluded.stops,service=excluded.service,revision=routes.revision+1').bind(rid,r.name,r.color,JSON.stringify(r.stops),r.service).run();}
else if(action==='bus'){admin(m);await expireTrips(db);const v=z.object({id:id.optional(),name:str,plate:str,routeId:id,nightRouteId:id.nullable().optional()}).parse(b.bus);if((await getRoute(db,v.routeId)).service==='evening')throw new AppError('Assign a morning route for pickups.');if(v.nightRouteId&&(await getRoute(db,v.nightRouteId)).service!=='evening')throw new AppError('Assign an evening route for home drop-offs.');const existing=await db.prepare('SELECT id FROM buses LIMIT 1').first<{id:string}>();if(existing&&v.id!==existing.id)throw new AppError('There is one company bus. Edit its details instead of adding another.',409);const bid=v.id??crypto.randomUUID();const active=await db.prepare('SELECT id FROM trips WHERE bus_id = ? AND status = ?').bind(bid,'active').first();if(active)throw new AppError('End this bus trip before editing it.',409);try{await db.prepare('INSERT INTO buses (id,name,plate,route_id,night_route_id) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plate=excluded.plate,route_id=excluded.route_id,night_route_id=excluded.night_route_id').bind(bid,v.name,v.plate,v.routeId,v.nightRouteId??null).run();}catch(e){if(String(e).includes('UNIQUE constraint failed: buses.slot'))throw new AppError('The company bus was already added. Refresh to edit its details.',409);throw e;}}
else if(action==='member'){
 admin(m);const v=z.object({email:z.string().email().max(254).transform(s=>s.toLowerCase()),name:str,role:z.enum(['worker','driver']),section:z.enum(['Flightops','Fulops','CCA','Office & Support Staff']).nullable().optional()}).parse(b.member);
 if(v.role==='driver'&&v.section)throw new AppError('Work sections apply to worker accounts.');
 const existing=await db.prepare('SELECT role,section FROM members WHERE email = ?').bind(v.email).first<any>();if(existing?.role==='admin')throw new AppError('The administrator role cannot be changed here.');
 const section=v.role==='worker'?(v.section===undefined?existing?.section??null:v.section):null;
 await db.prepare('INSERT INTO members (email,name,role,section) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,section=excluded.section').bind(v.email,v.name,v.role,section).run();
}
else if(action==='night-driver'){admin(m);await expireTrips(db);const email=z.string().email().max(254).transform(v=>v.toLowerCase()).parse(b.email);const target=await db.prepare("SELECT email FROM members WHERE email=? AND role IN ('driver','admin')").bind(email).first();if(!target)throw new AppError('Choose an approved night driver.');const active=await db.prepare('SELECT id FROM trips WHERE service=? AND status=?').bind('evening','active').first();if(active)throw new AppError('End the evening trip before changing the night driver.',409);await db.prepare('INSERT INTO settings (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').bind('night-driver',email).run();}
else if(['planned-passengers','home','weekly-shifts','load-week','week-roster','trip-history'].includes(action))return json(await serviceAction(db,u,m,b));
else if(action==='worker-section'){
 if(m.role!=='worker')throw new AppError('Work sections apply to worker accounts.',403);
 const section=z.enum(['Flightops','Fulops','CCA','Office & Support Staff']).parse(b.section);
 await db.prepare('UPDATE members SET section=? WHERE email=? AND user_id=? AND role=?').bind(section,u.email.toLowerCase(),u.userId,'worker').run();
 return json({ok:true,section});
}
else if(action.startsWith('recording-')){admin(m);return json(await recordingAction(db,u.userId,b));}
else if(action==='pickup'){
 const v=z.object({lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),name:str,radius,emailArrival:z.boolean()}).parse(b.pickup);
 const bus=await db.prepare('SELECT * FROM buses LIMIT 1').first<any>();if(!bus)throw new AppError('The administrator must set up the company bus first.');
 const r=await getRoute(db,bus.route_id),point=projectPoint(v,routePath(r));if(!point||point.distance>150)throw new AppError('Choose a pickup point within 150 metres of the bus route.');
 await db.prepare('INSERT INTO pickups (user_id,bus_id,route_id,route_revision,lat,lng,name,route_offset,radius,email_arrival,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,route_revision=excluded.route_revision,lat=excluded.lat,lng=excluded.lng,name=excluded.name,route_offset=excluded.route_offset,radius=excluded.radius,email_arrival=excluded.email_arrival,updated_at=excluded.updated_at').bind(u.userId,bus.id,r.id,r.revision??1,point.lat,point.lng,v.name,point.offset,v.radius,Number(v.emailArrival),Date.now()).run();
 return json({ok:true,pickup:{...point,name:v.name,busId:bus.id,routeId:r.id,routeRevision:r.revision??1,radius:v.radius,emailArrival:Number(v.emailArrival)}});
}
else if(action==='shift'){
 const v=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),busId:id,routeId:id,stopId:id.optional(),usePickup:z.boolean().optional(),onShift:z.boolean(),radius,emailArrival:z.boolean().optional()}).parse(b.shift);
 if(Number.isNaN(Date.parse(v.date+'T00:00:00Z'))||v.date<today||v.date>dateInAccra(new Date(Date.now()+31*86400000))||new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)!==v.date)throw new AppError('Choose a valid date in the next 31 days.');
 const r=await getRoute(db,v.routeId),bus=await db.prepare('SELECT * FROM buses WHERE id=? AND route_id=?').bind(v.busId,v.routeId).first();if(!bus)throw new AppError('Choose the company bus route.');
 const p=v.usePickup?await db.prepare('SELECT * FROM pickups WHERE user_id=? AND bus_id=? AND route_id=? AND route_revision=?').bind(u.userId,v.busId,v.routeId,r.revision??1).first<any>():null;
 if(v.usePickup&&!p)throw new AppError('Select and save your pickup point on the current bus route first.');
 if(!v.usePickup&&!r.stops.some(s=>s.id===v.stopId))throw new AppError('Choose a stop on this route.');
 await db.prepare('INSERT INTO shifts (id,user_id,date,bus_id,route_id,stop_id,on_shift,radius,pickup_lat,pickup_lng,pickup_name,route_offset,route_revision,email_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,stop_id=excluded.stop_id,on_shift=excluded.on_shift,radius=excluded.radius,pickup_lat=excluded.pickup_lat,pickup_lng=excluded.pickup_lng,pickup_name=excluded.pickup_name,route_offset=excluded.route_offset,route_revision=excluded.route_revision,email_arrival=excluded.email_arrival').bind(crypto.randomUUID(),u.userId,v.date,v.busId,v.routeId,p?'saved-pickup':v.stopId!,Number(v.onShift),v.radius,p?.lat??null,p?.lng??null,p?.name??null,p?.route_offset??null,r.revision??1,Number(v.emailArrival??!!p?.email_arrival)).run();
}
else if(action==='load-shift'){const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(b.date);const s=await db.prepare('SELECT * FROM shifts WHERE user_id=? AND date=?').bind(u.userId,date).first<any>();return json({shift:castShift(s)});}
else if(action==='test-email'){admin(m);const status=await sendEmail(crypto.randomUUID(),u.email,'OnRoute arrival email test','Your company bus arrival-email connection is working. This is a test, not a real bus arrival.');return json({ok:status==='sent',status});}
else if(action==='start'){
 if(!['admin','driver'].includes(m.role))throw new AppError('A driver account is required.',403);
 const v=z.object({busId:id,test:z.boolean(),service:z.enum(['morning','evening']).default('morning')}).parse(b);
 if(!v.test&&!inServiceWindow(v.service))throw new AppError(v.service==='evening'?'Evening drop-offs run 18:00–21:00 GMT. Use Test mode outside those hours.':'Morning trips run from 06:00 to 08:00 GMT. Use a test trip outside those hours.');
 const bus=await db.prepare('SELECT * FROM buses WHERE id = ?').bind(v.busId).first<any>();if(!bus)throw new AppError('Bus not found.');
 const rid=v.service==='evening'?bus.night_route_id:bus.route_id;if(!rid)throw new AppError('Ask the administrator to assign an evening route to the bus.');
 if((await getRoute(db,rid)).service!==v.service)throw new AppError('The assigned route does not match this transport service.');
 if(v.service==='evening'){const night=await db.prepare('SELECT value FROM settings WHERE id=?').bind('night-driver').first<any>();if(night?.value!==u.email.toLowerCase())throw new AppError('Only the designated night driver can start evening trips.',403);}
 await expireTrips(db);
 const tid=crypto.randomUUID();try{await db.prepare('INSERT INTO trips (id,bus_id,route_id,driver_id,driver_name,date,status,test,next_stop,started_at,service) VALUES (?,?,?,?,?,?,?,?,0,?,?)').bind(tid,bus.id,rid,u.userId,m.name,today,'active',Number(v.test),Date.now(),v.service).run();}catch{throw new AppError('This bus already has an active trip. Ask the current driver to hand it over or end it.',409);}return json({ok:true,tripId:tid,driverEpoch:0});
}
else if(['offer-handover','cancel-handover','accept-handover','location','end','next-stop','delay','dropoff-complete'].includes(action)){
 if(action!=='end'&&!['admin','driver'].includes(m.role))throw new AppError('A driver account is required.',403);
 const tid=id.parse(b.tripId);
 if(action==='accept-handover'){
  const row=await db.prepare('SELECT * FROM trips WHERE id = ? AND status = ?').bind(tid,'active').first<any>();
  if(!row)throw new AppError('This trip is no longer active.',409);
  const t=castTrip(row);await activeWindow(t,db);if(t.service==='evening')throw new AppError('Evening trips use one designated driver; swaps are only for morning duty.',403);
  if(!t.handoverEmail||t.handoverEmail!==u.email.toLowerCase())throw new AppError('This handover is assigned to another driver.',403);
  checkEpoch(t,b);const v=freshLocation(b),now=Date.now(),r=await getRoute(db,t.routeId),routeProgress=progressAt(t,r,v);
  try{changed(await db.prepare('UPDATE trips SET driver_id=?,driver_name=?,driver_epoch=driver_epoch+1,handover_email=NULL,handover_name=NULL,lat=?,lng=?,accuracy=?,speed=?,updated_at=?,route_progress=? WHERE id=? AND status=? AND driver_epoch=? AND handover_email=?').bind(u.userId,m.name,v.lat,v.lng,v.accuracy,v.speed,now,routeProgress,t.id,'active',t.driverEpoch,u.email.toLowerCase()).run());}
  catch(e){if(String(e).includes('UNIQUE constraint'))throw new AppError('Your account already has another active trip.',409);throw e;}
  const bus=await db.prepare('SELECT name FROM buses WHERE id = ?').bind(t.busId).first<any>();
  await createAlerts(db,{...t,...v,driverId:u.userId,driverName:m.name,driverEpoch:t.driverEpoch+1,handoverEmail:null,handoverName:null,updatedAt:now,routeProgress},r,bus?.name??'Your bus');
  return json({ok:true,tripId:t.id,driverEpoch:t.driverEpoch+1});
 }
 const t=await ownTrip(db,tid,u.userId);checkEpoch(t,b);
 if(action==='end'){
  changed(await db.prepare('UPDATE trips SET status=?,handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1 WHERE id=? AND driver_id=? AND status=? AND driver_epoch=?').bind('ended',t.id,u.userId,'active',t.driverEpoch).run());
 }else{
  await activeWindow(t,db);
  if(action==='offer-handover'){
   if(t.service==='evening')throw new AppError('Evening trips use one designated driver. End the trip to finish duty.',403);
   if(t.handoverEmail)throw new AppError('Cancel the pending handover before choosing another driver.',409);
   const email=z.string().email().max(254).transform(s=>s.toLowerCase()).parse(b.email);
   if(email===u.email.toLowerCase())throw new AppError('Choose the driver taking over from you.');
   const target=await db.prepare("SELECT name FROM members WHERE email=? AND role IN ('driver','admin')").bind(email).first<{name:string}>();
   if(!target)throw new AppError('Choose an approved driver. The administrator can add driver accounts.');
   changed(await db.prepare('UPDATE trips SET handover_email=?,handover_name=?,driver_epoch=driver_epoch+1 WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL').bind(email,target.name,t.id,u.userId,'active',t.driverEpoch).run());
   return json({ok:true,driverEpoch:t.driverEpoch+1});
  }
  if(action==='cancel-handover'){
   if(!t.handoverEmail)throw new AppError('There is no pending handover.',409);
   changed(await db.prepare('UPDATE trips SET handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1,updated_at=NULL WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email=?').bind(t.id,u.userId,'active',t.driverEpoch,t.handoverEmail).run());
   return json({ok:true,driverEpoch:t.driverEpoch+1});
  }
  if(t.handoverEmail)throw new AppError('Handover is pending. Cancel it to continue your duty.',409);
  const r=await getRoute(db,t.routeId);
  const guard='id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL';
  if(action==='location'){
   const v=freshLocation(b),now=Date.now(),routeProgress=progressAt(t,r,v);if(t.updatedAt&&now-t.updatedAt<3000)return json({ok:true,throttled:true});
   const saved=await db.batch([db.prepare('UPDATE trips SET lat=?,lng=?,accuracy=?,speed=?,updated_at=?,route_progress=? WHERE '+guard).bind(v.lat,v.lng,v.accuracy,v.speed,now,routeProgress,t.id,u.userId,'active',t.driverEpoch),db.prepare('INSERT INTO trip_points (id,trip_id,driver_id,driver_epoch,lat,lng,accuracy,captured_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM trips WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL)').bind(crypto.randomUUID(),t.id,u.userId,t.driverEpoch,v.lat,v.lng,v.accuracy,v.capturedAt,t.id,u.userId,'active',t.driverEpoch)]);changed(saved[0]);
   const bus=await db.prepare('SELECT name FROM buses WHERE id = ?').bind(t.busId).first<any>();await createAlerts(db,{...t,...v,updatedAt:now,routeProgress},r,bus?.name??'Your bus');
  }
  if(action==='dropoff-complete'){
   if(t.service!=='evening')throw new AppError('Home drop-off confirmation is only for evening trips.');
   const worker=id.parse(b.userId);const booked=await db.prepare('SELECT id FROM night_bookings WHERE user_id=? AND bus_id=? AND route_id=? AND date=? AND on_shift=1').bind(worker,t.busId,t.routeId,t.date).first();if(!booked)throw new AppError('This worker is not booked for this evening trip.');
   const already=await db.prepare('SELECT delivered_at FROM night_deliveries WHERE trip_id=? AND user_id=?').bind(t.id,worker).first();if(already)return json({ok:true});
   changed(await db.prepare('INSERT OR IGNORE INTO night_deliveries (trip_id,user_id,delivered_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM trips WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL)').bind(t.id,worker,Date.now(),t.id,u.userId,'active',t.driverEpoch).run());
  }
  if(action==='next-stop'){
   if(t.service==='evening')throw new AppError('Confirm each home drop-off in the passenger list, then end the trip.');
   const next=z.number().int().parse(b.nextStop);if(next!==t.nextStop+1||next>r.stops.length)throw new AppError('Complete the current stop first.');
   changed(await db.prepare('UPDATE trips SET next_stop=?,status=? WHERE '+guard+' AND next_stop=?').bind(next,next===r.stops.length?'ended':'active',t.id,u.userId,'active',t.driverEpoch,t.nextStop).run());
   if(!t.test&&t.lat!==null&&t.lng!==null&&t.updatedAt&&Date.now()-t.updatedAt<=30000){const bn=await db.prepare('SELECT name FROM buses WHERE id = ?').bind(t.busId).first<any>();await createAlerts(db,t,r,bn?.name??'Your bus');}
  }
  if(action==='delay'){
   const minutes=z.number().int().min(0).max(120).parse(b.minutes);
   changed(await db.prepare('UPDATE trips SET delay_minutes=? WHERE '+guard).bind(minutes,t.id,u.userId,'active',t.driverEpoch).run());
   if(minutes>0&&!t.test){const ss=t.service==='evening'?await db.prepare('SELECT user_id FROM night_bookings WHERE bus_id=? AND route_id=? AND date=? AND on_shift=1').bind(t.busId,t.routeId,today).all<any>():await db.prepare('SELECT user_id FROM shifts WHERE bus_id = ? AND route_id = ? AND date = ? AND on_shift = 1').bind(t.busId,t.routeId,today).all<any>();if(ss.results.length)await db.batch(ss.results.map(s=>db.prepare('INSERT OR IGNORE INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,attempts) VALUES (?,?,?,?,?,?,?,?,0)').bind(crypto.randomUUID(),s.user_id,t.id,`delay-${minutes}`,'Your bus is delayed',`The driver reported a ${minutes}-minute delay. Check the map before heading out.`,Date.now(),'pending')));waitUntil(deliver(db,t.id));}
  }
 }
}
else if(action==='subscribe'){const count=await db.prepare('SELECT count(*) as total FROM subscriptions WHERE user_id = ?').bind(u.userId).first<{total:number}>();const v=z.object({endpoint:z.string().url().max(4096),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]+$/).min(80).max(120),auth:z.string().regex(/^[A-Za-z0-9_-]+$/).min(20).max(30)})}).parse(b.subscription);const url=new URL(v.endpoint);const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.notify.windows.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.push.apple.com');if(url.protocol!=='https:'||url.port||!allowed)throw new AppError('Unsupported browser push service.');const known=await db.prepare('SELECT endpoint FROM subscriptions WHERE endpoint = ? AND user_id = ?').bind(v.endpoint,u.userId).first();if((count?.total??0)>=5&&!known)throw new AppError('Notifications are already enabled on five devices.');await db.prepare('INSERT INTO subscriptions (endpoint,user_id,subscription) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription').bind(v.endpoint,u.userId,JSON.stringify(v)).run();}
else if(action==='test-push'){const status=await push(db,u.userId,{title:'OnRoute alerts are ready',body:'This is a test notification. Arrival alerts will follow your saved shift and stop.',tag:'onroute-test'});return json({ok:status==='sent',status});}
else throw new AppError('Unknown action.');return json({ok:true});}catch(e){return handle(e);}}
function handle(e:unknown){if(e instanceof AppError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:e.issues[0]?.message??'Check the entered values.'},400);console.error('Transport request failed',String(e));return json({error:'Transport service is unavailable. Your changes have not been confirmed; please retry.'},503);}
