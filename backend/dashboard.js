import {Router} from 'express';
import {z} from 'zod';
import {rows,tx,dto} from './db.js';
import {authenticate,house} from './security.js';
import {houseHealth,range,fail,page} from './domain.js';
import {eventHistory,health} from './data.js';
export const dashboard=Router();
export async function snapshot(actor,q={}){
 let ids=actor.house_ids;const requested=q.houseIds?.split(',')??(q.houseId?[q.houseId]:null);if(requested){for(const id of requested)await house(actor,id);ids=requested;}
 const window=q.from||q.to?range(q):[new Date(Date.now()-86400000),new Date()];
 return tx(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const {rows:houses}=await c.query("SELECT * FROM houses WHERE tenant_id=$1 AND ($2::text[] IS NULL OR id=ANY($2)) AND status<>'ARCHIVED' ORDER BY name",[actor.tenant_id,ids]);const hs=houses.map(h=>h.id);
 const {rows:devices}=await c.query("SELECT * FROM devices WHERE tenant_id=$1 AND house_id=ANY($2) AND status<>'ARCHIVED'",[actor.tenant_id,hs]);
 for(const d of devices)if(d.status==='ONLINE'&&Date.now()-new Date(d.last_seen).getTime()>Number(process.env.HEARTBEAT_SECONDS||45)*1000)d.status='OFFLINE';
 const {rows:alerts}=await c.query("SELECT * FROM alerts WHERE tenant_id=$1 AND house_id=ANY($2) AND state<>'RESOLVED'",[actor.tenant_id,hs]);
 const {rows:recentEvents}=await c.query('SELECT id,type,house_id,device_id,occurred_at,source,confidence,processing_state FROM events WHERE tenant_id=$1 AND house_id=ANY($2) AND occurred_at >= $3 AND occurred_at < $4 ORDER BY occurred_at DESC LIMIT 15',[actor.tenant_id,hs,...window]);
 const {rows:[v]}=await c.query('SELECT COALESCE(max(id),0) AS version FROM live_events');
 const result=houses.map(h=>{const ds=devices.filter(d=>d.house_id===h.id),as=alerts.filter(a=>a.house_id===h.id);return {...dto(h),houseId:h.id,health:houseHealth(ds,as),activeAlertCount:as.length,lastSeen:ds.map(d=>d.last_seen).filter(Boolean).sort((a,b)=>b-a)[0]??null,devices:ds.map(dto),alerts:as.map(dto)};});
 return {summaryVersion:Number(v.version),generatedAt:new Date().toISOString(),totals:{houses:houses.length,onlineDevices:devices.filter(d=>d.status==='ONLINE').length,offlineDevices:devices.filter(d=>d.status==='OFFLINE').length,activeAlerts:alerts.length},houses:result,recentEvents:recentEvents.map(dto)};});
}
dashboard.get('/dashboard/summary',authenticate,async(req,res)=>res.json(await snapshot(req.actor,req.query)));
dashboard.get('/houses/status',authenticate,async(req,res)=>{if(req.query.status&&!['ALERT','OFFLINE','DEGRADED','HEALTHY'].includes(req.query.status))fail(400,'STATUS','Invalid house health.');const s=await snapshot(req.actor,req.query);const p=page(req.query);res.json({items:s.houses.filter(h=>!req.query.status||h.health===req.query.status).slice(p.offset,p.offset+p.limit)});});
dashboard.get('/houses/:houseId/timeline',authenticate,async(req,res)=>res.json(await eventHistory(req.actor,{...req.query,houseId:req.params.houseId})));
dashboard.get('/dashboard/preferences',authenticate,async(req,res)=>{const [p]=await rows('SELECT settings FROM preferences WHERE user_id=$1',[req.actor.id]);res.json(p?.settings??{center:[37.3382,-121.8863],zoom:12,filters:{}});});
dashboard.put('/dashboard/preferences',authenticate,async(req,res)=>{const b=z.object({center:z.tuple([z.number().min(-90).max(90),z.number().min(-180).max(180)]),zoom:z.number().int().min(1).max(19),filters:z.record(z.string(),z.string())}).strict().parse(req.body);await rows('INSERT INTO preferences(user_id,settings) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings',[req.actor.id,b]);res.json(b);});
dashboard.get('/dashboard/health',authenticate,async(req,res)=>{const h=await health(req.actor);res.json({api:'HEALTHY',database:h.postgres,mongo:h.mongo,websocket:'POLLING_DURABLE_LOG',mapProvider:'CLIENT_CHECKED',checkedAt:h.checkedAt});});
