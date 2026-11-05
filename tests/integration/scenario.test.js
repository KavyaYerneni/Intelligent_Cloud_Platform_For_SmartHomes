import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
import {start} from '../../backend/server.js';
import {pool,docs,close} from '../../backend/db.js';
import {processOne,processNotifications} from '../../backend/processing.js';
let server,base,token,owner,outsider,technician;
async function request(path,{method='GET',body,auth=token,key}={}){const r=await fetch(`${base}/api/v1${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
before(async()=>{server=start(0);await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;for(const name of ['operator','owner','outsider','technician']){const r=await request('/auth/login',{method:'POST',body:{email:`${name}@demo.local`,password:process.env.DEMO_PASSWORD},auth:''});assert.equal(r.status,200);if(name==='operator')token=r.body.token;if(name==='owner')owner=r.body.token;if(name==='outsider')outsider=r.body.token;if(name==='technician')technician=r.body.token;}});
after(async()=>{server?.closeAllConnections();await new Promise(r=>server?server.close(r):r());await close();});
test('Integrated scenario: inventory, scoped live push, persistence, duplicates, lifecycle and recovery',async()=>{
 const suffix=randomUUID().slice(0,8);let r=await request('/houses',{method:'POST',body:{name:`Integration ${suffix}`,address:'Synthetic',lat:37.33,lng:-121.88}});assert.equal(r.status,201);const h=r.body;
 r=await request(`/houses/${h.id}/rooms`,{method:'POST',body:{name:'Living',roomType:'living'}});assert.equal(r.status,201);const room=r.body;
 const payload={name:'Test microphone',type:'microphone',serialNo:`SN-${suffix}`,capabilities:['audio'],firmwareVersion:'1.0'};
 r=await request(`/rooms/${room.id}/devices`,{method:'POST',body:payload});assert.equal(r.status,201);const d=r.body;
 assert.equal((await request(`/rooms/${room.id}/devices`,{method:'POST',body:payload})).status,409);
 assert.equal((await request(`/devices/${d.id}`,{auth:owner})).status,403);
 assert.equal((await request(`/devices/${d.id}`,{auth:outsider})).status,403);
 assert.equal((await request('/data/health',{auth:technician})).status,403);
 assert.equal((await request('/houses',{auth:owner,method:'POST',body:{name:'forbidden',address:'x',lat:0,lng:0}})).status,403);
 const ws=new WebSocket(base.replace('http','ws')+'/ws/monitoring');const messages=[];await new Promise((resolve,reject)=>{ws.on('open',()=>ws.send(JSON.stringify({token,houseIds:[h.id]})));ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);if(m.type==='CONNECTED')resolve();});ws.on('error',reject);});
 try{
 const stamp=new Date().toISOString();assert.equal((await request(`/devices/${d.id}/heartbeat`,{method:'POST',body:{timestamp:stamp,firmware:'1.0',metrics:{}}})).body.status,'ONLINE');
 assert.equal((await request(`/devices/${d.id}/heartbeat`,{method:'POST',body:{timestamp:stamp,firmware:'1.0'}})).status,400);
 const e={eventId:`evt-${suffix}`,correlationId:`corr-${suffix}`,houseId:h.id,deviceId:d.id,type:'smoke_alarm',occurredAt:new Date().toISOString(),source:'simulator',confidence:.94,payload:{synthetic:true}};
 assert.equal((await request('/events',{method:'POST',body:e,key:e.eventId})).status,202);
 assert.equal((await request('/events',{method:'POST',body:e,key:e.eventId})).status,202);
 assert.equal((await request('/events',{method:'POST',body:{...e,confidence:.3},key:e.eventId})).status,409);
 for(let i=0;i<100;i++){await processOne();const state=await pool.query('SELECT processing_state FROM events WHERE tenant_id=$1 AND id=$2',['T001',e.eventId]);if(state.rows[0].processing_state==='CONSISTENT')break;}
 assert.equal(await docs.collection('telemetry_events').countDocuments({tenantId:'T001',eventId:e.eventId}),1);
 const event=await request(`/events/${e.eventId}`);assert.equal(event.body.processingState,'CONSISTENT');assert.equal(event.body.aiResult.inference,'SIMULATED_OR_RULE_BASED');
 let a=(await request(`/alerts?houseId=${h.id}`)).body.items[0];assert.equal(a.severity,'CRITICAL');
 assert.equal((await request(`/alerts/${a.id}/state`,{method:'PATCH',body:{targetState:'RESOLVED',expectedVersion:a.version,note:'illegal shortcut'}})).status,409);
 for(const state of ['ACKNOWLEDGED','INVESTIGATING','RESOLVED']){r=await request(`/alerts/${a.id}/state`,{method:'PATCH',body:{targetState:state,expectedVersion:a.version,note:'Synthetic scenario outcome'}});assert.equal(r.status,200);a=r.body;}
 assert.equal((await request(`/alerts/${a.id}/state`,{method:'PATCH',body:{targetState:'ACTIVE',expectedVersion:a.version,note:'manual reopen'}})).status,409);
 const detail=(await request(`/alerts/${a.id}`)).body;assert.equal(detail.history.filter(h=>h.action==='ALERT_TRANSITION').length,3);
 assert.equal((await request(`/data/events?houseId=${h.id}`)).status,400);
 const history=await request(`/data/events?houseId=${h.id}&from=${new Date(Date.now()-3600000).toISOString()}&to=${new Date(Date.now()+60000).toISOString()}`);assert(history.body.items.some(x=>x.id===e.eventId));
 // Simulate a worker restart between Mongo insert and SQL completion; the same evidence upsert is safe.
 const pending={...e,eventId:`recover-${suffix}`,type:'normal_appliance_sound'};await request('/events',{method:'POST',body:pending});await docs.collection('telemetry_events').insertOne({...pending,tenantId:'T001',occurredAt:new Date(pending.occurredAt)});await processOne();assert.equal(await docs.collection('telemetry_events').countDocuments({tenantId:'T001',eventId:pending.eventId}),1);
 await processNotifications();
 const deadline=Date.now()+5000;while(!messages.some(m=>m.type==='ALERT_CREATED')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));assert(messages.some(m=>m.type==='ALERT_CREATED'));assert(messages.filter(m=>m.houseId).every(m=>m.houseId===h.id));
 const current=(await request(`/devices/${d.id}`)).body;assert.equal((await request(`/devices/${d.id}`,{method:'PATCH',body:{status:'ARCHIVED',reason:'Integration complete',expectedVersion:current.version}})).status,200);assert.equal((await request(`/devices/${d.id}/heartbeat`,{method:'POST',body:{timestamp:new Date(Date.now()+1000).toISOString(),firmware:'1.0'}})).status,409);
 }finally{ws.close();}
});
test('Unauthorized WebSocket house subscription is rejected',async()=>{const ws=new WebSocket(base.replace('http','ws')+'/ws/monitoring');const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.terminate();reject(Error('Socket did not reject scope'));},5000);ws.on('open',()=>ws.send(JSON.stringify({token:outsider,houseIds:['H001']})));ws.on('close',code=>{clearTimeout(timer);resolve(code);});ws.on('error',reject);});assert.equal(code,1008);});
