import {z} from 'zod';
import {AppError} from './errors.ts';
import type {Database,User} from './context.ts';
import {dateInAccra,type Trip,type Passenger} from './transport.ts';
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export function validFutureDate(value:string){const time=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==value||value<dateInAccra()||value>dateInAccra(new Date(Date.now()+31*86400000)))throw new AppError('Choose a valid date in the next 31 days.');}
export const castHome=(r:any)=>r?{name:r.name,lat:r.lat,lng:r.lng,radius:r.radius,emailArrival:r.email_arrival}:null;
export const castWeekly=(r:any)=>({date:r.date,name:r.name,email:r.email,shiftLabel:r.shift_label,onShift:!!r.on_shift,morning:!!r.morning,evening:!!r.evening});
export async function roster(db:Database,t:Pick<Trip,'id'|'service'|'busId'|'routeId'|'date'>|null):Promise<Passenger[]>{
 if(!t)return [];
 if(t.service==='evening'){
  const rows=await db.prepare('SELECT n.*,coalesce(w.name,m.name) AS worker_name,w.shift_label,m.email,m.section,d.delivered_at FROM night_bookings n JOIN members m ON m.user_id=n.user_id LEFT JOIN weekly_shifts w ON w.user_id=n.user_id AND w.date=n.date LEFT JOIN night_deliveries d ON d.trip_id=? AND d.user_id=n.user_id WHERE n.bus_id=? AND n.route_id=? AND n.date=? AND n.on_shift=1 AND m.role=? ORDER BY m.name').bind(t.id,t.busId,t.routeId,t.date,'worker').all<any>();
  return rows.results.map(r=>({shiftLabel:r.shift_label??null,userId:r.user_id,name:r.worker_name,email:r.email,section:r.section,destination:r.name,lat:r.lat,lng:r.lng,delivered:!!r.delivered_at}));
 }
 const rows=await db.prepare('SELECT s.*,coalesce(w.name,m.name) AS name,w.shift_label,m.email,m.section FROM shifts s JOIN members m ON m.user_id=s.user_id LEFT JOIN weekly_shifts w ON w.user_id=s.user_id AND w.date=s.date WHERE s.bus_id=? AND s.route_id=? AND s.date=? AND s.on_shift=1 AND m.role=? ORDER BY s.route_offset,m.name').bind(t.busId,t.routeId,t.date,'worker').all<any>();
 return rows.results.map(r=>({shiftLabel:r.shift_label??null,userId:r.user_id,name:r.name,email:r.email,section:r.section,destination:r.pickup_name??'Scheduled pickup stop',lat:r.pickup_lat,lng:r.pickup_lng,delivered:false}));
}
export async function serviceAction(db:Database,u:User,m:any,b:any){
 if(b.action==='planned-passengers'){
  if(!['admin','driver'].includes(m.role))throw new AppError('A driver account is required.',403);
  const service=z.enum(['morning','evening']).parse(b.service);
  if(service==='evening'&&m.role!=='admin'){const night=await db.prepare('SELECT value FROM settings WHERE id=?').bind('night-driver').first<any>();if(night?.value!==u.email.toLowerCase())throw new AppError('Only the assigned night driver can view evening home destinations.',403);}
  const bus=await db.prepare('SELECT * FROM buses LIMIT 1').first<any>();if(!bus)throw new AppError('Set up the bus first.');const routeId=service==='evening'?bus.night_route_id:bus.route_id;if(!routeId)throw new AppError('Assign a route for this service first.');
  return {passengers:await roster(db,{id:'planned',busId:bus.id,routeId,date:dateInAccra(),service})};
 }
 if(b.action==='home'){
  if(m.role!=='worker')throw new AppError('Home destinations belong to worker accounts.',403);
  const h=z.object({name:z.string().trim().min(1).max(100),lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),radius:z.union([z.literal(500),z.literal(1000),z.literal(2000),z.literal(3000),z.literal(5000)]),emailArrival:z.boolean()}).parse(b.home);
  await db.prepare('INSERT INTO homes (user_id,name,lat,lng,radius,email_arrival,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,radius=excluded.radius,email_arrival=excluded.email_arrival,updated_at=excluded.updated_at').bind(u.userId,h.name,h.lat,h.lng,h.radius,Number(h.emailArrival),Date.now()).run();return {ok:true};
 }
 if(b.action==='weekly-shifts'){
  if(m.role!=='worker')throw new AppError('Weekly shifts belong to worker accounts.',403);
  const v=z.object({name:z.string().trim().min(1).max(100),days:z.array(z.object({date,onShift:z.boolean(),morning:z.boolean(),evening:z.boolean(),shiftLabel:z.string().trim().min(1).max(100)})).length(7)}).parse(b);
  v.days.forEach(d=>validFutureDate(d.date));
  const sorted=[...v.days].sort((a,b)=>a.date.localeCompare(b.date));if(sorted.some((d,i)=>i>0&&Date.parse(d.date)-Date.parse(sorted[i-1].date)!==86400000))throw new AppError('Submit seven consecutive days for your week.');
  if(v.days.some(d=>!d.onShift&&(d.morning||d.evening)))throw new AppError('Transport can only be requested on a working day.');
  const bus=await db.prepare('SELECT * FROM buses LIMIT 1').first<any>();if(!bus)throw new AppError('The administrator must set up the bus first.');
  const pickup=await db.prepare('SELECT * FROM pickups WHERE user_id=?').bind(u.userId).first<any>();
  const home=await db.prepare('SELECT * FROM homes WHERE user_id=?').bind(u.userId).first<any>();
  const route=await db.prepare('SELECT * FROM routes WHERE id=?').bind(bus.route_id).first<any>();
  if(v.days.some(d=>d.morning)&&(!pickup||pickup.route_id!==bus.route_id||pickup.route_revision!==route?.revision))throw new AppError('Save a pickup point on the current morning route first.');
  if(v.days.some(d=>d.evening)&&(!home||!bus.night_route_id))throw new AppError('Save your home destination and ask the administrator to assign an evening route first.');
  const statements=[];
  for(const d of v.days){
   statements.push(db.prepare('INSERT INTO weekly_shifts (id,user_id,date,name,email,shift_label,on_shift,morning,evening,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET name=excluded.name,email=excluded.email,shift_label=excluded.shift_label,on_shift=excluded.on_shift,morning=excluded.morning,evening=excluded.evening,submitted_at=excluded.submitted_at').bind(crypto.randomUUID(),u.userId,d.date,v.name,u.email.toLowerCase(),d.shiftLabel,Number(d.onShift),Number(d.morning),Number(d.evening),Date.now()));
   if(pickup&&pickup.route_id===bus.route_id&&pickup.route_revision===route?.revision)statements.push(db.prepare('INSERT INTO shifts (id,user_id,date,bus_id,route_id,stop_id,on_shift,radius,pickup_lat,pickup_lng,pickup_name,route_offset,route_revision,email_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,stop_id=excluded.stop_id,on_shift=excluded.on_shift,radius=excluded.radius,pickup_lat=excluded.pickup_lat,pickup_lng=excluded.pickup_lng,pickup_name=excluded.pickup_name,route_offset=excluded.route_offset,route_revision=excluded.route_revision,email_arrival=excluded.email_arrival').bind(crypto.randomUUID(),u.userId,d.date,bus.id,bus.route_id,'saved-pickup',Number(d.onShift&&d.morning),pickup.radius,pickup.lat,pickup.lng,pickup.name,pickup.route_offset,pickup.route_revision,pickup.email_arrival));
   else statements.push(db.prepare('UPDATE shifts SET on_shift=0 WHERE user_id=? AND date=?').bind(u.userId,d.date));
   if(home&&bus.night_route_id)statements.push(db.prepare('INSERT INTO night_bookings (id,user_id,date,bus_id,route_id,on_shift,name,lat,lng,radius,email_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,on_shift=excluded.on_shift,name=excluded.name,lat=excluded.lat,lng=excluded.lng,radius=excluded.radius,email_arrival=excluded.email_arrival').bind(crypto.randomUUID(),u.userId,d.date,bus.id,bus.night_route_id,Number(d.onShift&&d.evening),home.name,home.lat,home.lng,home.radius,home.email_arrival));
   else statements.push(db.prepare('UPDATE night_bookings SET on_shift=0 WHERE user_id=? AND date=?').bind(u.userId,d.date));
  }
  await db.batch(statements);return {ok:true};
 }
 if(b.action==='load-week'){
  const start=date.parse(b.start);validFutureDate(start);const end=dateInAccra(new Date(Date.parse(start+'T00:00:00Z')+6*86400000));
  const rows=await db.prepare('SELECT * FROM weekly_shifts WHERE user_id=? AND date>=? AND date<=? ORDER BY date').bind(u.userId,start,end).all<any>();return {days:rows.results.map(castWeekly)};
 }
 if(b.action==='week-roster'){
  if(m.role!=='admin')throw new AppError('Only the administrator can view weekly submissions.',403);
  const start=date.parse(b.start);const time=Date.parse(start+'T00:00:00Z');if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==start)throw new AppError('Choose a valid week date.');const end=dateInAccra(new Date(Date.parse(start+'T00:00:00Z')+6*86400000));
  const rows=await db.prepare('SELECT w.*,m.section FROM weekly_shifts w JOIN members m ON m.user_id=w.user_id WHERE w.date>=? AND w.date<=? ORDER BY w.date,w.name').bind(start,end).all<any>();return {days:rows.results.map(r=>({...castWeekly(r),section:r.section}))};
 }
 if(b.action==='trip-history'){
  if(m.role!=='admin')throw new AppError('Only the administrator can review trip trails.',403);
  const tid=z.string().min(1).max(100).parse(b.tripId);const points=await db.prepare('SELECT lat,lng,accuracy,captured_at FROM trip_points WHERE trip_id=? ORDER BY captured_at LIMIT 10000').bind(tid).all<any>();return {points:points.results.map(r=>({lat:r.lat,lng:r.lng,accuracy:r.accuracy,capturedAt:r.captured_at}))};
 }
 throw new AppError('Unknown service action.');
}
