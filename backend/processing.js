import {pool,tx,docs,dto} from './db.js';
import {classify,id} from './domain.js';
import {audit,live} from './security.js';
import {notify} from './alerts.js';
export async function processOne(tenantId=null){
 return tx(async c=>{
 const {rows:[e]}=await c.query("SELECT * FROM events WHERE processing_state='PENDING' AND next_attempt_at<=now() AND ($1::text IS NULL OR tenant_id=$1) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",[tenantId]);if(!e)return false;
 const actor={id:'ingestion-worker',tenant_id:e.tenant_id};
 try{
  const b=e.envelope;const rule=classify(b);
  const detail={...b,tenantId:e.tenant_id,occurredAt:new Date(b.occurredAt)};
  if(b.type==='telemetry')detail.expiresAt=new Date(Date.now()+90*86400000);
  await docs.collection('telemetry_events').updateOne({tenantId:e.tenant_id,eventId:e.id},{$setOnInsert:detail},{upsert:true});
  if(b.type!=='telemetry')await docs.collection('ai_results').updateOne({tenantId:e.tenant_id,eventId:e.id},{$setOnInsert:{tenantId:e.tenant_id,eventId:e.id,label:b.type,confidence:b.confidence,model:rule.model,modelVersion:b.modelVersion,source:b.source,inference:'SIMULATED_OR_RULE_BASED',processedAt:new Date()}},{upsert:true});
 }catch{
  const attempts=e.attempts+1;const state=attempts>=5?'QUARANTINED':'PENDING';
  await c.query('UPDATE events SET attempts=$3,processing_state=$4,last_error=$5,next_attempt_at=now()+($6 * interval \'1 second\') WHERE tenant_id=$1 AND id=$2',[e.tenant_id,e.id,attempts,state,'MONGO_UNAVAILABLE',Math.min(60,2**attempts)]);
  await audit(c,actor,'INGESTION_RETRY',e.id,e.house_id,{attempts,state},e.correlation_id);return true;
 }
 // Serialize grouping across workers for a single device, including different event IDs.
 await c.query('SELECT id FROM devices WHERE id=$1 FOR UPDATE',[e.device_id]);
 const rule=classify(e.envelope);
 if(rule.severity){
  const {rows:[match]}=await c.query("SELECT * FROM alerts WHERE tenant_id=$1 AND house_id=$2 AND device_id=$3 AND type=$4 AND state<>'RESOLVED' AND created_at>=now()-($5 * interval '1 second') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[e.tenant_id,e.house_id,e.device_id,e.type,rule.window]);
  let a;
  if(match){({rows:[a]}=await c.query("UPDATE alerts SET evidence_count=evidence_count+1,version=version+1,updated_at=now(),severity=CASE WHEN severity='MEDIUM' AND $2='HIGH' THEN 'HIGH' ELSE severity END WHERE id=$1 RETURNING *",[match.id,rule.severity]));}
  else{({rows:[a]}=await c.query('INSERT INTO alerts(id,tenant_id,house_id,device_id,event_id,type,severity,explanation) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id('A'),e.tenant_id,e.house_id,e.device_id,e.id,e.type,rule.severity,rule.explanation]));}
  await c.query('INSERT INTO alert_evidence(alert_id,tenant_id,event_id) VALUES($1,$2,$3)',[a.id,e.tenant_id,e.id]);
  await audit(c,actor,match?'ALERT_GROUPED':'ALERT_CREATED',a.id,e.house_id,{eventId:e.id,fromState:match?.state??'DETECTED',toState:a.state},e.correlation_id);
  if(!match&&['CRITICAL','HIGH'].includes(a.severity))await notify(c,a);
  await live(c,actor,e.house_id,match?'ALERT_UPDATED':'ALERT_CREATED',dto(a),e.correlation_id);
 }
 await c.query("UPDATE events SET processing_state='CONSISTENT',envelope=NULL,last_error=NULL WHERE tenant_id=$1 AND id=$2",[e.tenant_id,e.id]);
 await live(c,actor,e.house_id,'EVENT_CREATED',{eventId:e.id,deviceId:e.device_id,type:e.type},e.correlation_id);
 return true;
 });
}
export async function processNotifications(){return tx(async c=>{const {rows:[n]}=await c.query("SELECT * FROM notifications WHERE status IN ('PENDING','FAILED') AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");if(!n)return;const attempts=n.attempts+1;const failed=process.env.NOTIFICATION_FAIL==='true';const status=failed?(attempts>=5?'EXHAUSTED':'FAILED'):'SENT';await c.query("UPDATE notifications SET attempts=$2,status=$3,last_error=$4,next_attempt_at=now()+($5 * interval '1 second') WHERE id=$1",[n.id,attempts,status,failed?'SIMULATED_PROVIDER_FAILURE':null,Math.min(60,2**attempts)]);await audit(c,{id:'notification-worker',tenant_id:n.tenant_id},'SIMULATED_NOTIFICATION',n.alert_id,n.house_id,{deliveryId:n.id,status,attempts,channel:'SIMULATED'});});}
export async function expireDevices(){await tx(async c=>{const {rows:expired}=await c.query("UPDATE devices SET status='OFFLINE',version=version+1 WHERE status='ONLINE' AND last_seen<now()-($1 * interval '1 second') RETURNING *",[Number(process.env.HEARTBEAT_SECONDS||45)]);for(const d of expired)await live(c,{tenant_id:d.tenant_id},d.house_id,'DEVICE_STATUS_CHANGED',dto(d));await c.query("UPDATE commands SET state='EXPIRED' WHERE state IN ('QUEUED','SENT') AND created_at<now()-interval '60 seconds'");});}
export async function persistHeartbeats(){await tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(281004)');await c.query('CREATE TABLE IF NOT EXISTS worker_cursor (name text PRIMARY KEY, cursor bigint NOT NULL)');await c.query("INSERT INTO worker_cursor VALUES('heartbeat',0) ON CONFLICT DO NOTHING");const {rows:items}=await c.query("SELECT * FROM live_events WHERE type='DEVICE_HEARTBEAT' AND id>(SELECT cursor FROM worker_cursor WHERE name='heartbeat') ORDER BY id LIMIT 100");for(const m of items){await docs.collection('device_status').updateOne({_id:String(m.id)},{$setOnInsert:{tenantId:m.tenant_id,houseId:m.house_id,...m.payload,timestamp:new Date(m.payload.timestamp),expiresAt:new Date(Date.now()+90*86400000)}},{upsert:true});await c.query("UPDATE worker_cursor SET cursor=$1 WHERE name='heartbeat'",[m.id]);}});}
