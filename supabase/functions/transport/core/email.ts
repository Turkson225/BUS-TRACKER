import {runtime,type Database as D1Database} from './context.ts';
export function emailReady(){const e=runtime();return !!e.EMAIL_RELAY_SECRET&&e.EMAIL_RELAY_SECRET.length>=32&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(e.EMAIL_RELAY_URL??'');}
export async function sendEmail(eventId:string,to:string,subject:string,body:string){
 if(!emailReady())return 'not-configured';const e=runtime();
 try{
  let response=await fetch(e.EMAIL_RELAY_URL!,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:e.EMAIL_RELAY_SECRET,eventId,to,subject,body}),redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(response.status===302||response.status===303){const target=new URL(response.headers.get('location')??'');if(target.protocol!=='https:'||target.hostname!=='script.googleusercontent.com'||target.port)return 'failed';response=await fetch(target.href,{redirect:'error',signal:AbortSignal.timeout(8000)});}
  if(!response.ok)return 'failed';const result=await response.json() as {ok?:boolean;eventId?:string;uncertain?:boolean};if(result.uncertain)return 'uncertain';return result.ok&&result.eventId===eventId?'sent':'failed';
 }catch{return 'failed';}
}
export async function deliverEmails(db:D1Database,tid:string){
 const pending=await db.prepare("SELECT * FROM alerts WHERE trip_id=? AND email_state IN ('pending','failed') AND email_attempts<3 AND created_at>? LIMIT 50").bind(tid,Date.now()-120000).all<any>();
 for(let i=0;i<pending.results.length;i+=5)await Promise.allSettled(pending.results.slice(i,i+5).map(async a=>{
  const claim=await db.prepare("UPDATE alerts SET email_state='sending',email_attempts=email_attempts+1 WHERE id=? AND email_attempts=? AND email_state IN ('pending','failed')").bind(a.id,a.email_attempts).run();if(!claim.meta.changes)return;
  const trip=await db.prepare('SELECT service FROM trips WHERE id=?').bind(tid).first<{service:string}>();
  const member=trip?.service==='evening'?await db.prepare('SELECT m.email FROM members m JOIN night_bookings n ON n.user_id=m.user_id JOIN trips t ON t.id=? WHERE m.user_id=? AND n.date=t.date AND n.bus_id=t.bus_id AND n.route_id=t.route_id AND n.on_shift=1 AND n.email_arrival=1 AND m.role=?').bind(tid,a.user_id,'worker').first<{email:string}>():await db.prepare('SELECT m.email FROM members m JOIN shifts s ON s.user_id=m.user_id JOIN trips t ON t.id=? JOIN routes r ON r.id=t.route_id WHERE m.user_id=? AND s.date=t.date AND s.bus_id=t.bus_id AND s.route_id=t.route_id AND s.route_revision=r.revision AND s.on_shift=1 AND s.email_arrival=1').bind(tid,a.user_id).first<{email:string}>();
  const state=member?.email===a.email_to?await sendEmail(a.id,a.email_to,a.title,a.body+'\n\nOnRoute company bus tracker · Arrival detected from phone GPS.'):'cancelled';
  await db.prepare('UPDATE alerts SET email_state=? WHERE id=?').bind(state,a.id).run();
 }));
}
