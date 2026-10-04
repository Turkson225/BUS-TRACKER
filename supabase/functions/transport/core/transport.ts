export type Point={lat:number;lng:number};
export type RecordedPoint=Point&{accuracy:number;capturedAt:number};
export type PickupPoint=Point&{name:string;offset:number};
export type PickupProfile=PickupPoint&{busId:string;routeId:string;routeRevision:number;radius:number;emailArrival:number};
export type RouteRecording={id:string;name:string;status:string;points:RecordedPoint[];pointCount:number;createdAt:number;updatedAt:number};
export type Stop={id:string;name:string;lat:number;lng:number;time:string};
export type Route={id:string;name:string;color:string;stops:Stop[];path?:Point[];revision?:number;recorded?:number};
export type Bus={id:string;name:string;plate:string;routeId:string};
export type Trip={id:string;busId:string;routeId:string;driverId:string;driverName:string;date:string;status:string;test:number;nextStop:number;lat:number|null;lng:number|null;accuracy:number|null;speed:number|null;updatedAt:number|null;startedAt:number;delayMinutes:number;driverEpoch:number;handoverEmail:string|null;handoverName:string|null;routeProgress?:number};
export type Shift={date:string;busId:string;routeId:string;stopId:string;onShift:number;radius:number;pickup?:PickupPoint|null;emailArrival?:number;routeRevision?:number};
export type Alert={id:string;title:string;body:string;createdAt:number;kind:string;pushState:string;emailState?:string};
export type Member={email:string;name:string;role:string;section:string|null};
export type State={user:{id:string;name:string;email:string;role:string;section:string|null}|null;configured:boolean;company:string;today:string;inWindow:boolean;routes:Route[];buses:Bus[];trips:Trip[];shift:Shift|null;alerts:Alert[];members:Member[];vapidPublicKey:string|null;pickup:PickupProfile|null;recording:RouteRecording|null;emailReady:boolean};
export const dateInAccra=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Accra',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function inPickupWindow(date=new Date()){const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Accra',hour:'2-digit',hourCycle:'h23'}).format(date));return h>=6&&h<8;}
export function distance(a:{lat:number;lng:number},b:{lat:number;lng:number}){const r=Math.PI/180;const v=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v));}
export function remainingDistance(trip:Trip,route:Route,stopIndex:number){if(trip.lat===null||trip.lng===null||stopIndex<trip.nextStop||!route.stops[trip.nextStop])return null;if(route.path&&route.path.length>=2){const target=projectPoint(route.stops[stopIndex],route.path,-Infinity,pathLength(route.path)*stopIndex/Math.max(1,route.stops.length-1));return target?pickupDistance(trip,route,{...target,name:route.stops[stopIndex].name}):null;}let d=distance({lat:trip.lat,lng:trip.lng},route.stops[trip.nextStop]);for(let i=trip.nextStop;i<stopIndex;i++)d+=distance(route.stops[i],route.stops[i+1]);return d;}
export function freshness(trip:Trip|undefined,now=Date.now()){if(!trip)return 'Not started';if(trip.status!=='active')return 'Trip ended';if(trip.handoverName)return 'Driver handover';if(trip.test)return 'Test trip';if(!trip.updatedAt)return 'Waiting for GPS';if(now-trip.updatedAt>45000)return 'Location outdated';if((trip.accuracy??999)>100)return 'Weak GPS';return 'Live GPS';}
export const sampleRoutes:Route[]=[{id:'sample-route',name:'Example pickup route',color:'#BE5CA9',stops:[{id:'n1',name:'North junction',lat:4.939,lng:-1.777,time:'06:05'},{id:'n2',name:'Market stop',lat:4.925,lng:-1.766,time:'06:20'},{id:'n3',name:'Central pickup',lat:4.913,lng:-1.755,time:'06:35'},{id:'n4',name:'Company gate',lat:4.900,lng:-1.749,time:'07:00'}]}];
export const sampleBuses:Bus[]=[{id:'sample-bus-1',name:'Company bus',plate:'Sample vehicle',routeId:'sample-route'}];
export function sampleTrips(progress:number):Trip[]{const r=sampleRoutes[0];const p=progress%2.8,j=Math.floor(p),f=p-j,a=r.stops[j],z=r.stops[j+1];return [{id:'sample-trip',busId:sampleBuses[0].id,routeId:r.id,driverId:'sample',driverName:'Sample on-duty driver',date:dateInAccra(),status:'active',test:1,nextStop:j+1,lat:a.lat+(z.lat-a.lat)*f,lng:a.lng+(z.lng-a.lng)*f,accuracy:10,speed:8,updatedAt:null,startedAt:0,delayMinutes:0,driverEpoch:0,handoverEmail:null,handoverName:null}];}

export function routePath(r:Route):Point[]{return r.path&&r.path.length>=2?r.path:r.stops;}
export function pathLength(path:Point[]){let total=0;for(let i=1;i<path.length;i++)total+=distance(path[i-1],path[i]);return total;}
// Project onto the recorded polyline. Offset is metres from its start.
export function projectPoint(point:Point,path:Point[],minOffset=-Infinity,preferredOffset?:number){
 let total=0,best:{lat:number;lng:number;offset:number;distance:number}|null=null;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],len=distance(a,b);if(len<.01)continue;
  const scale=Math.cos((a.lat+b.lat)*Math.PI/360),dx=(b.lng-a.lng)*scale,dy=b.lat-a.lat;
  const f=Math.max(0,Math.min(1,((point.lng-a.lng)*scale*dx+(point.lat-a.lat)*dy)/(dx*dx+dy*dy)));
  const p={lat:a.lat+f*(b.lat-a.lat),lng:a.lng+f*(b.lng-a.lng)},offset=total+f*len,d=distance(point,p),tolerance=preferredOffset===undefined?.01:15;
  if(offset>=minOffset&&(!best||d<best.distance-tolerance||(Math.abs(d-best.distance)<=tolerance&&(preferredOffset===undefined?offset<best.offset:Math.abs(offset-preferredOffset)<Math.abs(best.offset-preferredOffset)))))best={...p,offset,distance:d};
  total+=len;
 }
 return best;
}
export function progressAt(t:Trip,r:Route,p:Point&{accuracy?:number}){const current=t.routeProgress??0;if((p.accuracy??999)>100)return current;const projection=projectPoint(p,routePath(r),current-100,current);return projection&&projection.distance<=150?Math.max(current,projection.offset):current;}
export function pickupDistance(t:Trip,r:Route,p:PickupPoint){if(t.lat===null||t.lng===null)return null;const projection=projectPoint({lat:t.lat,lng:t.lng},routePath(r),(t.routeProgress??0)-100,t.routeProgress??0);if(!projection||projection.distance>150||p.offset<(t.routeProgress??0)-150)return null;return Math.max(0,p.offset-projection.offset);}
