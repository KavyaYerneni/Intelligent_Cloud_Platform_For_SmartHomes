// AI audio adapter (Component 3 "classifier adapter", System Design AIModel).
//
// A microphone (or the simulator, or scripts/audio-agent.mjs replaying dataset
// files) sends a WAV clip. The inference service (ml/) runs YAMNet + the team's
// trained classifier; this module maps the model's label to a platform event
// type (domain.AI_LABEL_MAP) and stores the event through the same idempotent
// path as POST /events, with source "model". From there the existing worker
// applies ALERT_RULES, creates alerts and pushes live updates.
//
// Only this module can create source "model" events: POST /events refuses that
// source from clients, so an event shown as "AI model" really came from inference.
import express,{Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {rows,pool,dto} from './db.js';
import {AI_LABEL_MAP,ALERT_RULES,classify as alertRule,eventSchema,eventTypeForLabel,fail,identifier,validTime} from './domain.js';
import {authenticate,deviceActor,device,house,role,audit} from './security.js';
import {storeEvent} from './alerts.js';
import * as ml from './ml.js';
import {broadPrediction,broadEventType} from './audio-routing.js';

export const ai=Router();
export const AUDIO_MODEL=()=>process.env.AUDIO_MODEL_NAME||'human-sounds';
export const ANIMAL_MODEL=()=>process.env.ANIMAL_MODEL_NAME||'animal-sounds';
export const APPLIANCE_MODEL=()=>process.env.APPLIANCE_MODEL_NAME||'appliance-sounds';
const rawAudio=express.raw({type:['audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','application/octet-stream'],limit:process.env.MAX_AUDIO_UPLOAD||'6mb'});
const audioBody=req=>{if(!Buffer.isBuffer(req.body)||!req.body.length)fail(400,'EMPTY_AUDIO','Send the WAV file as the request body with Content-Type: audio/wav.');return req.body;};

const versionKey=v=>v.split('.').map(n=>Number(n)||0);
const newest=list=>[...list].sort((a,b)=>{const x=versionKey(a.version),y=versionKey(b.version);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (y[i]||0)-(x[i]||0);}return 0;})[0];

/** Model this tenant uses for live audio: its saved choice, else the newest loaded version. */
export async function activeModel(tenantId){
 const {items,embedder}=await ml.listModels();
 const name=AUDIO_MODEL();
 const loaded=items.filter(m=>m.name===name&&m.loaded);
 const [setting]=await rows('SELECT * FROM ai_model_settings WHERE tenant_id=$1 AND model_name=$2',[tenantId,name]);
 const chosen=(setting?.version&&loaded.find(m=>m.version===setting.version))||newest(loaded);
 return {name,version:chosen?.version??null,enabled:setting?setting.enabled:true,manifest:chosen??null,embedder,
  updatedBy:setting?.updated_by??null,updatedAt:setting?.updated_at??null,versions:items.filter(m=>m.name===name)};
}

/** Every attempt is logged, including ones that never became an event. Never throws. */
async function logInference(f){
 try{
  await pool.query(`INSERT INTO ai_inferences(tenant_id,house_id,device_id,event_id,model_name,model_version,label,event_type,confidence,latency_ms,audio_seconds,status,error_code,correlation_id,input_origin)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
   [f.tenantId,f.houseId??null,f.deviceId??null,f.eventId??null,f.model?.name??null,f.model?.version??null,f.label??null,f.eventType??null,f.confidence??null,f.latencyMs??null,f.audioSeconds??null,f.status,f.errorCode??null,f.correlationId,f.inputOrigin??'unspecified']);
 }catch(e){console.error(JSON.stringify({component:'ai',error:'INFERENCE_LOG_FAILED',detail:e.code||e.name}));}
}

const summary=inf=>({label:inf.label,confidence:inf.confidence,eventType:eventTypeForLabel(inf.label),
 probabilities:inf.probabilities.slice(0,5),model:inf.model,audio:inf.audio,latencyMs:inf.latencyMs,
 audioSetTop:inf.audioSetTop,testEmbedder:!!inf.embedder?.testOnly});

// ---------------------------------------------------------------- live audio
ai.post('/devices/:deviceId/audio',deviceActor,rawAudio,async(req,res)=>{
 const a=req.actor;
 if(a.role==='device'){if(a.deviceId!==req.params.deviceId)fail(403,'DEVICE_AUTH','Credential belongs to a different device.');}
 else{role(a,'operator','technician');if(process.env.SIMULATOR_ENABLED!=='true')fail(403,'SIMULATOR_DISABLED','Send audio with the device credential.');}
 const d=await device(a,req.params.deviceId);
 const h=await house(a,d.house_id);
 if(d.status==='ARCHIVED')fail(409,'ARCHIVED','Archived devices cannot send audio.');
 if(h.status!=='ACTIVE')fail(409,'INACTIVE','The house is not active.');
 if(!(d.capabilities||[]).includes('audio'))fail(400,'CAPABILITY','This device has no audio capability.');
 const eventId=req.headers['x-event-id']?identifier.parse(req.headers['x-event-id']):`aud-${randomUUID()}`;
 const inputOrigin=z.enum(['unspecified','recorded-dataset','microphone']).default('unspecified').parse(req.headers['x-audio-origin']);
 const base={inputOrigin,tenantId:d.tenant_id,houseId:d.house_id,deviceId:d.id,correlationId:req.correlationId};

 // Retried upload with the same X-Event-Id: return the stored result without re-running inference.
 const [prior]=await rows('SELECT * FROM events WHERE tenant_id=$1 AND id=$2',[d.tenant_id,eventId]);
 if(prior){
  if(prior.device_id!==d.id||prior.source!=='model')fail(409,'IDEMPOTENCY_CONFLICT','This event ID is already used for different content.');
  const [log]=await rows("SELECT * FROM ai_inferences WHERE tenant_id=$1 AND event_id=$2 AND status='OK' ORDER BY id LIMIT 1",[d.tenant_id,eventId]);
  return res.status(200).json({replayed:true,eventId,processingState:prior.processing_state,inference:log?dto(log):null});
 }
 const occurredAt=req.headers['x-captured-at']?new Date(validTime(req.headers['x-captured-at'])).toISOString():new Date().toISOString();
 const wav=audioBody(req);
 const classifier=z.enum(['human','animal','appliance','general']).default('human').parse(req.headers['x-audio-classifier']);

 let active;
 try{
  if(classifier==='animal'||classifier==='appliance'){
   const {items,embedder}=await ml.listModels();
   const name=classifier==='animal'?ANIMAL_MODEL():APPLIANCE_MODEL();
   const loaded=items.filter(m=>m.name===name&&m.loaded);
   const chosen=newest(loaded);
   active={name,version:chosen?.version??null,enabled:true,manifest:chosen??null,embedder,updatedBy:null,updatedAt:null,versions:items.filter(m=>m.name===name)};
  } else {
   active=await activeModel(d.tenant_id);
  }
 }
 catch(e){await logInference({...base,status:'FAILED',errorCode:e.code});fail(503,e.code||'AI_UNAVAILABLE',`${e.message} Keep the clip and retry with the same X-Event-Id.`);}
 if(!active.version){await logInference({...base,status:'FAILED',errorCode:'MODEL_NOT_LOADED'});fail(503,'MODEL_NOT_LOADED','No version of the audio model is loaded in the inference service.');}
 if(!active.enabled){await logInference({...base,model:active,status:'REJECTED',errorCode:'MODEL_DISABLED'});fail(409,'MODEL_DISABLED','Audio inference is disabled for your community. An operator can enable it on the AI models page.');}

 let inf;
 try{inf=await ml.classify(wav,active);}
 catch(e){
  await logInference({...base,model:active,status:e.status===503?'FAILED':'REJECTED',errorCode:e.code});
  if(e.status===503)fail(503,e.code,`${e.message} Keep the clip and retry with the same X-Event-Id.`);
  fail(e.status,e.code,e.message);
 }
 if(classifier==='general') {
  try { inf=broadPrediction(inf); } catch { fail(503,'AUDIOSET_UNAVAILABLE','The broad sound classifier is unavailable.'); }
 }
 const type=classifier==='general'?broadEventType(inf.label):eventTypeForLabel(inf.label);
 if(!type){await logInference({...base,model:active,label:inf.label,status:'FAILED',errorCode:'UNMAPPED_LABEL'});fail(502,'UNMAPPED_LABEL',`The model returned "${inf.label}", which has no event mapping.`);}

 const b=eventSchema.parse({eventId,correlationId:req.correlationId,houseId:d.house_id,deviceId:d.id,type,occurredAt,source:'model',
  confidence:inf.confidence,modelVersion:`${inf.model.name}@${inf.model.version}`,
  payload:{modelLabel:inf.label,model:inf.model,probabilities:inf.probabilities.slice(0,5),audio:inf.audio,backbone:'YAMNet',
   latencyMs:inf.latencyMs,audioSetTop:inf.audioSetTop||[],testEmbedder:!!inf.embedder?.testOnly}});
 const e=await storeEvent(a,d,b,eventId);
 await logInference({...base,eventId,model:inf.model,label:inf.label,eventType:type,confidence:inf.confidence,latencyMs:inf.latencyMs,audioSeconds:inf.audio?.durationSeconds,status:'OK'});
 res.status(202).json({eventId:e.id,processingState:e.processing_state,correlationId:e.correlation_id,
  inference:{...summary(inf),eventType:type},alertPreview:alertRule(b).severity});
});

// ---------------------------------------------------------------- model management
ai.get('/ai/models',authenticate,async(req,res)=>{
 role(req.actor,'operator','technician');
 const labelMap=Object.entries(AI_LABEL_MAP).map(([label,m])=>({label,eventType:m.type,why:m.why,rule:ALERT_RULES.find(r=>r.type===m.type)}));
 try{
  if(req.query.fresh==='true')ml.resetModelCache();
  const active=await activeModel(req.actor.tenant_id);
  res.json({service:{reachable:true,embedder:active.embedder},active:{name:active.name,version:active.version,enabled:active.enabled,updatedBy:active.updatedBy,updatedAt:active.updatedAt},models:active.versions,labelMap});
 }catch(e){
  if(!(e instanceof ml.MlError))throw e;
  const [setting]=await rows('SELECT * FROM ai_model_settings WHERE tenant_id=$1 AND model_name=$2',[req.actor.tenant_id,AUDIO_MODEL()]);
  res.json({service:{reachable:false,error:e.message,code:e.code},active:{name:AUDIO_MODEL(),version:setting?.version??null,enabled:setting?setting.enabled:true},models:[],labelMap});
 }
});

ai.put('/ai/models/:name/settings',authenticate,async(req,res)=>{
 role(req.actor,'operator');
 const b=z.object({enabled:z.boolean(),version:z.string().trim().min(1).max(40).optional()}).strict().parse(req.body);
 const {items}=await ml.listModels({fresh:true});
 const versions=items.filter(m=>m.name===req.params.name);
 if(!versions.length)fail(404,'MODEL_NOT_FOUND','No model with that name is registered.');
 if(b.version&&!versions.some(m=>m.version===b.version&&m.loaded))fail(400,'VERSION','That version is not loaded in the inference service.');
 const [before]=await rows('SELECT * FROM ai_model_settings WHERE tenant_id=$1 AND model_name=$2',[req.actor.tenant_id,req.params.name]);
 await pool.query(`INSERT INTO ai_model_settings(tenant_id,model_name,version,enabled,updated_by) VALUES($1,$2,$3,$4,$5)
  ON CONFLICT(tenant_id,model_name) DO UPDATE SET version=EXCLUDED.version,enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=now()`,
  [req.actor.tenant_id,req.params.name,b.version??before?.version??null,b.enabled,req.actor.id]);
 await audit(pool,req.actor,b.enabled?'AI_MODEL_ENABLED':'AI_MODEL_DISABLED',`${req.params.name}@${b.version??before?.version??'latest'}`,null,
  {before:before?{enabled:before.enabled,version:before.version}:{enabled:true,version:null},after:b},req.correlationId);
 const active=await activeModel(req.actor.tenant_id);
 res.json({name:active.name,version:active.version,enabled:active.enabled,updatedBy:active.updatedBy,updatedAt:active.updatedAt});
});

// Try the model on a clip. No event, no alert; logged as a TEST inference.
ai.post('/ai/test',authenticate,rawAudio,async(req,res)=>{
 role(req.actor,'operator','technician');
 const wav=audioBody(req);
 const active=await activeModel(req.actor.tenant_id).catch(e=>fail(503,e.code||'AI_UNAVAILABLE',e.message));
 const version=req.query.version?String(req.query.version):active.version;
 if(!version)fail(503,'MODEL_NOT_LOADED','No version of the audio model is loaded.');
 let inf;
 try{inf=await ml.classify(wav,{name:active.name,version});}
 catch(e){await logInference({tenantId:req.actor.tenant_id,correlationId:req.correlationId,model:{name:active.name,version},status:e.status===503?'FAILED':'REJECTED',errorCode:e.code});fail(e.status,e.code,e.message);}
 const s=summary(inf);
 await logInference({tenantId:req.actor.tenant_id,correlationId:req.correlationId,model:inf.model,label:inf.label,eventType:s.eventType,confidence:inf.confidence,latencyMs:inf.latencyMs,audioSeconds:inf.audio?.durationSeconds,status:'TEST'});
 res.json({...s,probabilities:inf.probabilities,embedder:inf.embedder,frames:inf.frames,
  alertPreview:s.eventType?alertRule({type:s.eventType,confidence:inf.confidence}).severity:null});
});

// Live monitoring statistics, scoped to the caller's houses.
ai.get('/ai/stats',authenticate,async(req,res)=>{
 role(req.actor,'operator','technician');
 const hours=z.coerce.number().int().min(1).max(168).default(24).parse(req.query.hours);
 const since=new Date(Date.now()-hours*3600000);
 const scope="i.tenant_id=$1 AND i.created_at>=$2 AND ($3::text[] IS NULL OR i.house_id=ANY($3) OR (i.house_id IS NULL AND i.status='TEST'))";
 const args=[req.actor.tenant_id,since,req.actor.house_ids];
 const byStatus=await rows(`SELECT status,count(*)::int AS count FROM ai_inferences i WHERE ${scope} GROUP BY status`,args);
 const byLabel=await rows(`SELECT label,event_type,count(*)::int AS count,round(avg(confidence)::numeric,4)::float AS avg_confidence FROM ai_inferences i WHERE ${scope} AND status='OK' GROUP BY label,event_type ORDER BY count DESC`,args);
 const [lat]=await rows(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95 FROM ai_inferences i WHERE ${scope} AND status IN ('OK','TEST')`,args);
 const [alerts]=await rows(`SELECT count(*)::int AS count FROM alerts a JOIN events e ON e.tenant_id=a.tenant_id AND e.id=a.event_id WHERE a.tenant_id=$1 AND a.created_at>=$2 AND ($3::text[] IS NULL OR a.house_id=ANY($3)) AND e.source='model'`,args);
 const recent=await rows(`SELECT i.*,h.name AS house_name,d.name AS device_name FROM ai_inferences i LEFT JOIN houses h ON h.id=i.house_id LEFT JOIN devices d ON d.id=i.device_id WHERE ${scope} ORDER BY i.id DESC LIMIT 20`,args);
 res.json({hours,since,byStatus:Object.fromEntries(byStatus.map(r=>[r.status,r.count])),byLabel:byLabel.map(dto),
  latencyMs:{p50:lat?.p50??null,p95:lat?.p95??null},alertsFromModel:alerts.count,recent:recent.map(dto)});
});
