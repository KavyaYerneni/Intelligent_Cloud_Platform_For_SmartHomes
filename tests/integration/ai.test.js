// AI audio adapter against real PostgreSQL + MongoDB. The inference service is
// replaced by a small fake that follows the ml/ HTTP contract (ml/tests/test_api.py
// checks the real service honours the same contract), so the adapter's behaviour
// can be driven precisely: chosen labels, failures and invalid audio.
import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {start} from '../../backend/server.js';
import {pool,docs,close} from '../../backend/db.js';
import {processOne} from '../../backend/processing.js';
import {resetModelCache} from '../../backend/ml.js';

const manifest=JSON.parse(readFileSync(new URL('../../ml/models/human-sounds/1.0.0/manifest.json',import.meta.url)));
const fake={mode:'ok',label:'Baby cry, infant cry',confidence:.93,calls:0};
const fakeServer=createServer((req,res)=>{
 const send=(s,b)=>{res.writeHead(s,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(fake.mode==='down'){send(503,{code:'EMBEDDER_UNAVAILABLE',message:'YAMNet not loaded'});return;}
 if(req.url==='/models')return send(200,{embedder:{kind:'yamnet',loaded:true},items:[{...manifest,loaded:true,sha256Verified:true,evaluation:null}]});
 if(req.url==='/health')return send(200,{status:'ok',embedder:{kind:'yamnet',loaded:true},models:[]});
 if(req.url.startsWith('/classify')){
  fake.calls++;
  req.resume();
  if(fake.mode==='bad')return send(400,{code:'NOT_WAV',message:'Only WAV audio is accepted.'});
  const rest=manifest.classes.filter(c=>c!==fake.label).map(c=>({label:c,probability:+((1-fake.confidence)/9).toFixed(4)}));
  return send(200,{model:{name:'human-sounds',version:'1.0.0',sha256:manifest.sha256},label:fake.label,confidence:fake.confidence,
   probabilities:[{label:fake.label,probability:fake.confidence},...rest],audio:{sampleRate:44100,channels:1,durationSeconds:5,resampledTo:16000},
   embedder:{kind:'yamnet',loaded:true,testOnly:false},frames:10,audioSetTop:[{label:'Dog',score:.82}],latencyMs:42});
 }
 send(404,{code:'NOT_FOUND'});
});

let server,base,op,tech,owner;
const createdHouses=[];
const WAV=Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVEfmt '),Buffer.alloc(64)]); // content is irrelevant to the fake
async function call(path,{method='GET',body,auth=op,headers={}}={}){
 const raw=Buffer.isBuffer(body);
 const r=await fetch(`${base}/api/v1${path}`,{method,headers:{...(auth?{Authorization:auth.startsWith('Device ')?auth:`Bearer ${auth}`}:{}),'Content-Type':raw?'audio/wav':'application/json',...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
}
before(async()=>{
 await new Promise(r=>fakeServer.listen(0,'127.0.0.1',r));
 process.env.ML_SERVICE_URL=`http://127.0.0.1:${fakeServer.address().port}`;
 resetModelCache();
 server=start(0);await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;
 for(const [who,set] of [['operator',t=>op=t],['technician',t=>tech=t],['owner',t=>owner=t]]){
  const r=await call('/auth/login',{method:'POST',auth:'',body:{email:`${who}@demo.local`,password:process.env.DEMO_PASSWORD}});assert.equal(r.status,200);set(r.body.token);
 }
});
after(async()=>{
 await pool.query("UPDATE houses SET status='ARCHIVED' WHERE id=ANY($1)",[createdHouses]);
 await pool.query("UPDATE alerts SET state='RESOLVED' WHERE house_id=ANY($1)",[createdHouses]);
 await pool.query("DELETE FROM ai_model_settings WHERE tenant_id='T001'");
 server?.closeAllConnections();await new Promise(r=>server.close(r));fakeServer.close();await close();
});

async function microphone(){
 const s=randomUUID().slice(0,8);
 const h=(await call('/houses',{method:'POST',body:{name:`AI ${s}`,address:'Synthetic',lat:37.3,lng:-121.9}})).body;
 createdHouses.push(h.id);
 const room=(await call(`/houses/${h.id}/rooms`,{method:'POST',body:{name:'Bedroom',roomType:'bedroom'}})).body;
 const mic=(await call(`/rooms/${room.id}/devices`,{method:'POST',body:{name:'Bedroom mic',type:'microphone',serialNo:`SN-AI-${s}`,capabilities:['audio']}})).body;
 const cred=(await call(`/devices/${mic.id}/credentials`,{method:'POST',body:{}})).body.credential;
 return {h,room,mic,device:`Device ${cred}`};
}
async function drain(eventId){
 for(let i=0;i<100;i++){await processOne();const {rows:[e]}=await pool.query("SELECT processing_state FROM events WHERE tenant_id='T001' AND id=$1",[eventId]);if(e.processing_state==='CONSISTENT')return;}
 assert.fail('event did not become consistent');
}

test('device audio becomes a model event, a HIGH alert and stored provenance; replay is idempotent',async()=>{
 const {h,mic,device}=await microphone();
 fake.mode='ok';fake.label='Baby cry, infant cry';fake.confidence=.93;
 const eventId=`aud-${randomUUID()}`;
 const calls=fake.calls;
 const r=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV,headers:{'X-Event-Id':eventId}});
 assert.equal(r.status,202,JSON.stringify(r.body));
 assert.equal(r.body.inference.label,'Baby cry, infant cry');
 assert.equal(r.body.inference.eventType,'human_help_sound');
 assert.equal(r.body.alertPreview,'HIGH');
 await drain(eventId);
 const ev=(await call(`/events/${eventId}`)).body;
 assert.equal(ev.source,'model');
 assert.equal(ev.aiResult.inference,'TRAINED_MODEL');
 assert.equal(ev.aiResult.modelSha256,manifest.sha256);
 assert.equal(ev.aiResult.probabilities[0].label,'Baby cry, infant cry');
 const alert=(await call(`/alerts?houseId=${h.id}`)).body.items[0];
 assert.equal(alert.severity,'HIGH');
 const snap=(await call(`/dashboard/summary?houseId=${h.id}`)).body;
 assert.equal(snap.audio.count,1);assert.equal(snap.audio.categories,1);
 assert.equal(snap.audio.daily.length,7);
 assert.equal(snap.audio.daily.at(-1).count,1);
 assert.equal(snap.audio.daily.slice(0,-1).reduce((n,d)=>n+d.count,0),0);
 assert.equal(snap.audio.timeZone,'America/Los_Angeles');
 assert.equal(snap.recentEvents[0].soundLabel,'Baby cry, infant cry');
 assert.equal(snap.recentEvents[0].roomName,'Bedroom');
 assert.equal(snap.recentEvents[0].alertSeverity,'HIGH');
 assert.equal((await call(`/dashboard/summary?houseId=${h.id}`,{auth:owner})).status,403);
 assert.match(alert.explanation,/^AI model human-sounds 1\.0\.0 heard "Baby cry, infant cry" \(93%\)/);
 // Retry with the same event ID: original result, no second inference, no second event.
 const again=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV,headers:{'X-Event-Id':eventId}});
 assert.equal(again.status,200);assert.equal(again.body.replayed,true);
 assert.equal(fake.calls,calls+1);
 assert.equal(await docs.collection('ai_results').countDocuments({tenantId:'T001',eventId}),1);
});

test('everyday sounds are stored without an alert',async()=>{
 const {h,mic,device}=await microphone();
 fake.mode='ok';fake.label='Laughter';fake.confidence=.97;
 const r=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV});
 assert.equal(r.status,202);assert.equal(r.body.inference.eventType,'normal_activity_sound');assert.equal(r.body.alertPreview,null);
 await drain(r.body.eventId);
 assert.equal((await call(`/alerts?houseId=${h.id}`)).body.total,0);
});

test('authorization: other devices, owners and fake model events are refused',async()=>{
 const a=await microphone(),b=await microphone();
 fake.mode='ok';
 assert.equal((await call(`/devices/${a.mic.id}/audio`,{method:'POST',auth:b.device,body:WAV})).status,403);
 assert.equal((await call(`/devices/${a.mic.id}/audio`,{method:'POST',auth:owner,body:WAV})).status,403);
 assert.equal((await call(`/devices/${a.mic.id}/audio`,{method:'POST',auth:tech,body:WAV})).status,202); // simulator path
 const forged={eventId:`evt-${randomUUID()}`,correlationId:'c1',houseId:a.h.id,deviceId:a.mic.id,type:'human_help_sound',occurredAt:new Date().toISOString(),source:'model',confidence:.99,payload:{}};
 assert.equal((await call('/events',{method:'POST',auth:a.device,body:forged})).status,403);
 assert.equal((await call('/events',{method:'POST',body:forged})).status,403);
 const cam=(await call(`/rooms/${a.room.id}/devices`,{method:'POST',body:{name:'Cam',type:'camera',serialNo:`SN-CAM-${randomUUID().slice(0,6)}`,capabilities:['video']}})).body;
 assert.equal((await call(`/devices/${cam.id}/audio`,{method:'POST',body:WAV})).body.code,'CAPABILITY');
 assert.equal((await call(`/devices/${a.mic.id}/audio`,{method:'POST',body:{}})).body.code,'EMPTY_AUDIO');
});

test('inference failures are reported, logged, and never create events',async()=>{
 const {mic,device}=await microphone();
 const {rows:[{n:before}]}=await pool.query("SELECT count(*)::int AS n FROM events WHERE device_id=$1",[mic.id]);
 fake.mode='bad';
 const bad=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV});
 assert.equal(bad.status,400);assert.equal(bad.body.code,'NOT_WAV');
 fake.mode='down';resetModelCache();
 const down=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV});
 assert.equal(down.status,503);assert.match(down.body.message,/retry with the same X-Event-Id/);
 fake.mode='ok';resetModelCache();
 const {rows:[{n:afterCount}]}=await pool.query("SELECT count(*)::int AS n FROM events WHERE device_id=$1",[mic.id]);
 assert.equal(afterCount,before);
 const {rows}=await pool.query("SELECT status,error_code FROM ai_inferences WHERE device_id=$1 ORDER BY id",[mic.id]);
 assert.deepEqual(rows.map(r=>`${r.status}:${r.error_code}`),['REJECTED:NOT_WAV','FAILED:EMBEDDER_UNAVAILABLE']);
 const models=(await call('/ai/models')).body; // page still renders when the service is down
 assert.equal(models.service.reachable,true);
});

test('model management: operator-only, per tenant, audited, enforced',async()=>{
 const {mic,device}=await microphone();
 fake.mode='ok';
 assert.equal((await call('/ai/models/human-sounds/settings',{method:'PUT',auth:tech,body:{enabled:false}})).status,403);
 const off=await call('/ai/models/human-sounds/settings',{method:'PUT',body:{enabled:false}});
 assert.equal(off.status,200);assert.equal(off.body.enabled,false);
 const r=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV});
 assert.equal(r.status,409);assert.equal(r.body.code,'MODEL_DISABLED');
 const {rows:[a]}=await pool.query("SELECT * FROM audit_log WHERE action='AI_MODEL_DISABLED' ORDER BY id DESC LIMIT 1");
 assert.equal(a.actor,'operator-01');
 assert.equal((await call('/ai/models/human-sounds/settings',{method:'PUT',body:{enabled:true,version:'9.9.9'}})).body.code,'VERSION');
 const on=await call('/ai/models/human-sounds/settings',{method:'PUT',body:{enabled:true,version:'1.0.0'}});
 assert.equal(on.body.enabled,true);assert.equal(on.body.version,'1.0.0');
 const listing=(await call('/ai/models',{auth:tech})).body;
 assert.equal(listing.active.version,'1.0.0');assert.equal(listing.models[0].sha256,manifest.sha256);
 assert.equal(listing.labelMap.length,10);
 assert.equal((await call('/ai/models',{auth:owner})).status,403);
});

test('test console classifies without creating events; stats summarise live inference',async()=>{
 fake.mode='ok';fake.label='Cough';fake.confidence=.95;
 const {rows:[{n:before}]}=await pool.query('SELECT count(*)::int AS n FROM events');
 const t=await call('/ai/test',{method:'POST',body:WAV});
 assert.equal(t.status,200);assert.equal(t.body.eventType,'unusual_sound');assert.equal(t.body.alertPreview,'HIGH');
 assert.equal(t.body.probabilities.length,10);
 const {rows:[{n:afterCount}]}=await pool.query('SELECT count(*)::int AS n FROM events');
 assert.equal(afterCount,before);
 const s=(await call('/ai/stats?hours=1')).body;
 assert(s.byStatus.OK>=2&&s.byStatus.TEST>=1&&s.byStatus.FAILED>=1,JSON.stringify(s.byStatus));
 assert(s.alertsFromModel>=1);
 assert(s.byLabel.some(x=>x.label==='Baby cry, infant cry'&&x.eventType==='human_help_sound'));
 assert(s.recent.some(x=>x.deviceName==='Bedroom mic'));
 assert.equal((await call('/ai/stats?hours=500')).status,400);
});


test('general audio retains AudioSet label, score and recorded provenance in scoped monitoring',async()=>{
 const {h,mic,device}=await microphone();fake.mode='ok';fake.label='Cough';fake.confidence=.99;
 const r=await call(`/devices/${mic.id}/audio`,{method:'POST',auth:device,body:WAV,headers:{'X-Audio-Classifier':'general','X-Audio-Origin':'recorded-dataset'}});
 assert.equal(r.status,202);assert.equal(r.body.inference.label,'Dog');assert.equal(r.body.inference.confidence,.82);assert.equal(r.body.alertPreview,null);
 await drain(r.body.eventId);
 const s=(await call(`/dashboard/summary?houseId=${h.id}`)).body;
 assert.equal(s.recentEvents[0].soundLabel,'Dog');assert.equal(s.recentEvents[0].inputOrigin,'recorded-dataset');assert.equal(s.audio.count,1);
});
