import type {Database as D1Database} from './context.ts';
import { z } from 'zod';
import { distance,pathLength,type RecordedPoint,type RouteRecording } from './transport.ts';
import { AppError } from './errors.ts';
const id=z.string().min(1).max(100),name=z.string().trim().min(1).max(100);
const point=z.object({lat:z.number().min(-85).max(85),lng:z.number().min(-180).max(180),accuracy:z.number().min(0).max(50),capturedAt:z.number().int().positive()});
export const castRecording=(r:any):RouteRecording=>({service:r.service??'morning',id:r.id,name:r.name,status:r.status,points:JSON.parse(r.points),pointCount:r.point_count,createdAt:r.created_at,updatedAt:r.updated_at});
export async function recordingAction(db:D1Database,uid:string,b:any){
 if(b.action==='recording-start'){
  const rid=crypto.randomUUID(),now=Date.now(),service=z.enum(['morning','evening']).default('morning').parse(b.service);
  try{await db.prepare('INSERT INTO route_recordings (id,owner_id,name,status,created_at,updated_at,service) VALUES (?,?,?,?,?,?,?)').bind(rid,uid,name.parse(b.name),'recording',now,now,service).run();}catch(e){if(String(e).includes('UNIQUE constraint'))throw new AppError('Finish or discard your existing route recording first.',409);throw e;}
  return {ok:true,recording:{service,id:rid,name:b.name.trim(),status:'recording',points:[],pointCount:0,createdAt:now,updatedAt:now}};
 }
 const row=await db.prepare('SELECT * FROM route_recordings WHERE id=? AND owner_id=?').bind(id.parse(b.recordingId),uid).first<any>();
 if(!row)throw new AppError('Your route recording was not found.',404);
 const r=castRecording(row);
 if(b.action==='recording-append'){
  const expected=z.number().int().min(0).max(10000).parse(b.expectedCount),points=z.array(point).min(1).max(100).parse(b.points);
  // A replay after a lost response acknowledges the identical saved batch.
  if(expected<r.pointCount&&expected+points.length<=r.pointCount&&JSON.stringify(r.points.slice(expected,expected+points.length))===JSON.stringify(points))return {ok:true,pointCount:r.pointCount};
  if(r.status!=='recording'||r.pointCount!==expected)throw new AppError('Recording changed on another screen. Pause and reload before continuing.',409);
  if(r.pointCount+points.length>10000)throw new AppError('The recording is full. Finish and review this route.');
  let previous=r.points.at(-1);
  for(const p of points){if(p.capturedAt<r.createdAt-30000||p.capturedAt>Date.now()+30000||Date.now()-p.capturedAt>28800000||(previous&&p.capturedAt<=previous.capturedAt))throw new AppError('Recorded fixes must be in time order during this recording.');if(previous){const seconds=(p.capturedAt-previous.capturedAt)/1000;if(distance(previous,p)>60*seconds+100)throw new AppError('GPS jumped too far. Review or restart the route recording.');}previous=p;}
  const saved=[...r.points,...points],result=await db.prepare('UPDATE route_recordings SET points=?,point_count=?,updated_at=? WHERE id=? AND owner_id=? AND status=? AND point_count=?').bind(JSON.stringify(saved),saved.length,Date.now(),r.id,uid,'recording',expected).run();
  if(!result.meta.changes)throw new AppError('Recording changed on another screen. Pause and reload before continuing.',409);
  return {ok:true,pointCount:saved.length};
 }
 if(b.action==='recording-resume'||b.action==='recording-review'){
  const status=b.action==='recording-resume'?'recording':'review';if(!['recording','review'].includes(r.status))throw new AppError('This recording is already finished.',409);
  await db.prepare('UPDATE route_recordings SET status=?,updated_at=? WHERE id=? AND owner_id=? AND status IN (?,?)').bind(status,Date.now(),r.id,uid,'recording','review').run();return {ok:true};
 }
 if(b.action==='recording-discard'){if(r.status==='saved')throw new AppError('This route has already been saved.',409);await db.prepare('UPDATE route_recordings SET status=?,updated_at=? WHERE id=? AND owner_id=?').bind('discarded',Date.now(),r.id,uid).run();return {ok:true};}
 if(b.action==='recording-save'){
  if(r.status==='saved')return {ok:true,routeId:r.id};
  if(r.status!=='review')throw new AppError('Stop recording and review the route before saving it.',409);
  if(r.points.length<2||pathLength(r.points)<100)throw new AppError('Record at least 100 metres of the route before saving it.');
  if(r.points.some((p,i)=>i>0&&distance(p,r.points[i-1])>500))throw new AppError('This trail has a GPS gap over 500 metres. Re-record it with the screen open.');
  const routeName=name.parse(b.name),path=r.points.map(({lat,lng})=>({lat,lng}));
  const stops=[{id:crypto.randomUUID(),name:'Route start',...path[0],time:r.service==='evening'?'18:00':'06:00'},{id:crypto.randomUUID(),name:r.service==='evening'?'Last home drop-off':'Company arrival',...path.at(-1)!,time:r.service==='evening'?'20:59':'07:59'}];
  const result=await db.batch([db.prepare('INSERT OR IGNORE INTO routes (id,name,color,stops,path,recorded,service) SELECT ?,?,?,?,?,1,? WHERE EXISTS (SELECT 1 FROM route_recordings WHERE id=? AND owner_id=? AND status=?)').bind(r.id,routeName,'#BE5CA9',JSON.stringify(stops),JSON.stringify(path),r.service??'morning',r.id,uid,'review'),db.prepare('UPDATE route_recordings SET status=?,name=?,updated_at=? WHERE id=? AND owner_id=? AND status=? AND EXISTS (SELECT 1 FROM routes WHERE id=?)').bind('saved',routeName,Date.now(),r.id,uid,'review',r.id)]);
  if(!result[0].meta.changes&&!result[1].meta.changes)throw new AppError('The recording changed before it was saved. Refresh and try again.',409);
  return {ok:true,routeId:r.id};
 }
 throw new AppError('Unknown route recording action.');
}
