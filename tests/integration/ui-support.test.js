// API additions made for the redesigned UI. Same conventions as scenario.test.js:
// real PostgreSQL + MongoDB, synthetic uniquely named records, nothing deleted.
import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {start} from '../../backend/server.js';
import {close} from '../../backend/db.js';
import {processOne} from '../../backend/processing.js';
import {ALERT_RULES,COMMANDS,DEVICE_TYPES} from '../../backend/domain.js';
let server,base,op,owner;
async function call(path,{method='GET',body,auth=op,key}={}){const r=await fetch(`${base}/api/v1${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
before(async()=>{server=start(0);await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 for(const [who,set] of [['operator',t=>op=t],['owner',t=>owner=t]]){const r=await call('/auth/login',{method:'POST',auth:'',body:{email:`${who}@demo.local`,password:process.env.DEMO_PASSWORD}});assert.equal(r.status,200);set(r.body.token);}});
after(async()=>{server?.closeAllConnections();await new Promise(r=>server.close(r));await close();});

async function fixture(){
 const s=randomUUID().slice(0,8);
 const h=(await call('/houses',{method:'POST',body:{name:`UI ${s}`,address:'Synthetic',lat:37.3,lng:-121.9}})).body;
 const room=(await call(`/houses/${h.id}/rooms`,{method:'POST',body:{name:'Kitchen',roomType:'kitchen'}})).body;
 const mic=(await call(`/rooms/${room.id}/devices`,{method:'POST',body:{name:'Kitchen mic',type:'microphone',serialNo:`SN-M-${s}`,capabilities:['audio']}})).body;
 const cam=(await call(`/rooms/${room.id}/devices`,{method:'POST',body:{name:'Hall camera',type:'camera',serialNo:`SN-C-${s}`,capabilities:['video']}})).body;
 return {s,h,room,mic,cam};
}

test('catalog serves the same rule tables the server enforces',async()=>{
 const r=await call('/catalog',{auth:owner});
 assert.equal(r.status,200);
 assert.deepEqual(r.body.deviceTypes,DEVICE_TYPES);
 assert.deepEqual(Object.keys(r.body.commands),Object.keys(COMMANDS));
 assert.deepEqual(r.body.alertRules.map(x=>x.type),ALERT_RULES.map(x=>x.type));
});

test('duplicate serial returns the existing device id and a field error',async()=>{
 const {room,mic}=await fixture();
 const r=await call(`/rooms/${room.id}/devices`,{method:'POST',body:{name:'Again',type:'microphone',serialNo:mic.serialNo,capabilities:['audio']}});
 assert.equal(r.status,409);assert.equal(r.body.code,'DUPLICATE_SERIAL');
 assert.equal(r.body.existingDeviceId,mic.id);assert.equal(r.body.fieldErrors[0].field,'serialNo');
});

test('device list filters on the server and reports a total',async()=>{
 const {h,room,mic,cam}=await fixture();
 let r=await call(`/devices?houseId=${h.id}`);
 assert.equal(r.body.total,2);assert.equal(r.body.items[0].roomName,'Kitchen');assert.equal(r.body.items[0].houseName,h.name);
 r=await call(`/devices?houseId=${h.id}&q=hall`);assert.deepEqual(r.body.items.map(d=>d.id),[cam.id]);
 r=await call(`/devices?houseId=${h.id}&type=microphone`);assert.deepEqual(r.body.items.map(d=>d.id),[mic.id]);
 r=await call(`/devices?houseId=${h.id}&roomId=${room.id}&status=REGISTERED`);assert.equal(r.body.total,2);
 assert.equal((await call(`/devices?houseId=${h.id}&status=FLYING`)).status,400);
 // archived devices are hidden by default but still queryable
 await call(`/devices/${cam.id}`,{method:'PATCH',body:{status:'ARCHIVED',reason:'test',expectedVersion:cam.version}});
 assert.equal((await call(`/devices?houseId=${h.id}`)).body.total,1);
 assert.equal((await call(`/devices?houseId=${h.id}&includeArchived=true`)).body.total,2);
 assert.equal((await call(`/devices?houseId=${h.id}&status=ARCHIVED`)).body.total,1);
});

test('rooms report device and online counts',async()=>{
 const {h,mic}=await fixture();
 await call(`/devices/${mic.id}/heartbeat`,{method:'POST',body:{timestamp:new Date().toISOString(),firmware:'1.0',metrics:{}}});
 const [room]=(await call(`/houses/${h.id}/rooms`)).body.items;
 assert.equal(room.deviceCount,2);assert.equal(room.onlineCount,1);
});

test('mute is refused for device types that cannot mute',async()=>{
 const {cam}=await fixture();
 await call(`/devices/${cam.id}/heartbeat`,{method:'POST',body:{timestamp:new Date().toISOString(),firmware:'1.0',metrics:{}}});
 const r=await call(`/devices/${cam.id}/commands`,{method:'POST',key:`k-${randomUUID()}`,body:{command:'mute',parameters:{durationSeconds:30}}});
 assert.equal(r.status,400);assert.equal(r.body.code,'CAPABILITY');
});

test('alerts carry house, room, device and actor names',async()=>{
 const {h,mic}=await fixture();
 await call(`/devices/${mic.id}/heartbeat`,{method:'POST',body:{timestamp:new Date().toISOString(),firmware:'1.0',metrics:{}}});
 const e={eventId:`evt-ui-${randomUUID().slice(0,8)}`,correlationId:'corr-ui',houseId:h.id,deviceId:mic.id,type:'smoke_alarm',occurredAt:new Date().toISOString(),source:'simulator',confidence:null,payload:{}};
 assert.equal((await call('/events',{method:'POST',body:e,key:e.eventId})).status,202);
 for(let i=0;i<50&&!(await call(`/alerts?houseId=${h.id}`)).body.items.length;i++)await processOne();
 const list=(await call(`/alerts?houseId=${h.id}`)).body;
 assert.equal(list.total,1);
 const a=list.items[0];
 assert.equal(a.houseName,h.name);assert.equal(a.deviceName,'Kitchen mic');assert.equal(a.roomName,'Kitchen');
 await call(`/alerts/${a.id}/state`,{method:'PATCH',body:{targetState:'ACKNOWLEDGED',note:'',expectedVersion:a.version}});
 const detail=(await call(`/alerts/${a.id}`)).body;
 assert(detail.history.some(x=>x.action==='ALERT_TRANSITION'&&x.actorEmail==='operator@demo.local'));
});
