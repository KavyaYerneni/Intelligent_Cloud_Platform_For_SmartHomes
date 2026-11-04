import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
export class AppError extends Error{constructor(status,code,message,extra={}){super(message);Object.assign(this,{status,code,...extra});}}
export const fail=(status,code,message,extra)=>{throw new AppError(status,code,message,extra);};
export const id=(prefix)=>`${prefix}-${randomUUID()}`;
export const text=z.string().trim().min(1).max(160);
export const identifier=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const timestamp=z.string().datetime({offset:true});
export function validTime(value,now=Date.now()){const ms=Date.parse(value);if(!Number.isFinite(ms)||ms<now-86400000||ms>now+60000)fail(400,'TIME_WINDOW','Timestamp must be within the last 24 hours and no more than 60 seconds ahead.');return ms;}
export const eventSchema=z.object({schemaVersion:z.literal('1.0').default('1.0'),eventId:identifier,correlationId:identifier,houseId:identifier,deviceId:identifier,type:z.enum(['smoke_alarm','human_help_sound','unusual_sound','normal_appliance_sound','telemetry']),occurredAt:timestamp,source:z.enum(['simulator','device','model']),confidence:z.number().min(0).max(1).nullable(),payload:z.record(z.string(),z.unknown()),modelVersion:text.default('v1')}).strict();
// Component 3 §3.6 configuration table. classify(), GET /api/v1/catalog and the
// simulator's outcome preview all read this one table, so they cannot disagree.
export const ALERT_RULES=[
 {type:'smoke_alarm',rule:'safety',severity:'CRITICAL',window:300,model:'deterministic-rules',explanation:'Deterministic smoke safety rule',notify:true},
 {type:'human_help_sound',rule:'confidence',threshold:.85,severity:'HIGH',window:120,model:'simulated-audio',explanation:'Help confidence >= 0.85',notify:true},
 {type:'unusual_sound',rule:'confidence',threshold:.75,severity:'MEDIUM',highAt:.9,window:300,model:'simulated-audio',explanation:'Unusual sound confidence >= 0.75; HIGH at 0.90',notify:'HIGH only'},
 {type:'normal_appliance_sound',rule:'none',severity:null,window:0,model:'simulated-audio',explanation:'Normal classification; retained without an alert',notify:false},
 {type:'telemetry',rule:'none',severity:null,window:0,model:'simulated-audio',explanation:'Routine telemetry; retained without an alert',notify:false},
];
const NO_ALERT={severity:null,window:0,explanation:'No alert threshold met',model:'simulated-audio'};
export function classify(e){
 const r=ALERT_RULES.find(x=>x.type===e.type);
 if(!r||!r.severity)return NO_ALERT;
 if(r.rule==='safety')return {severity:r.severity,window:r.window,explanation:r.explanation,model:r.model};
 if(e.confidence>=r.threshold)return {severity:r.highAt!==undefined&&e.confidence>=r.highAt?'HIGH':r.severity,window:r.window,explanation:r.explanation,model:r.model};
 return NO_ALERT;
}
export const DEVICE_TYPES=['camera','microphone','sensor','appliance','gateway'];
// Allowlisted commands (Component 2 B-I-03) and which device types accept them.
export const COMMANDS={
 test:{label:'Run self-test',types:DEVICE_TYPES,parameters:{}},
 restart:{label:'Restart',types:DEVICE_TYPES,parameters:{}},
 mute:{label:'Mute audio',types:['microphone','appliance'],parameters:{durationSeconds:{min:1,max:300}}},
 refresh_config:{label:'Reload configuration',types:DEVICE_TYPES,parameters:{}},
};
export const transitions={ACTIVE:['ACKNOWLEDGED','ESCALATED'],ACKNOWLEDGED:['INVESTIGATING','ESCALATED'],INVESTIGATING:['ESCALATED','RESOLVED'],ESCALATED:['RESOLVED'],RESOLVED:[]};
export function allowedActions(alert,role){if(role==='owner')return alert.state==='ACTIVE'?['ACKNOWLEDGED']:[];return ['operator','responder'].includes(role)?transitions[alert.state]:[];}
export function checkTransition(alert,target,actor,note,version){
 if(!allowedActions(alert,actor.role).includes(target))fail(409,'ILLEGAL_TRANSITION','Transition is not permitted.',{allowedActions:allowedActions(alert,actor.role)});
 if(alert.version!==version)fail(409,'STALE_VERSION','Reload the alert before updating.');
 if(target==='INVESTIGATING'&&!alert.assigned_to&&!note?.trim())fail(400,'NOTE_REQUIRED','Provide an investigation note or assign the alert.');
 if(target==='ESCALATED'&&!note?.trim())fail(400,'NOTE_REQUIRED','An escalation reason is required.');
 if(target==='RESOLVED'&&['HIGH','CRITICAL'].includes(alert.severity)&&!note?.trim())fail(400,'NOTE_REQUIRED','A resolution outcome note is required.');
}
export function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export const fingerprint=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export function range(q){const from=Date.parse(q.from),to=Date.parse(q.to);if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||to-from>31*86400000)fail(400,'TIME_RANGE','Provide from < to, at most 31 days apart.');return [new Date(from),new Date(to)];}
export function page(q){const n=Number(q.page??1),size=Number(q.pageSize??25);if(!Number.isInteger(n)||n<1||!Number.isInteger(size)||size<1||size>100)fail(400,'PAGE','page >= 1 and pageSize between 1 and 100 required.');return {limit:size,offset:(n-1)*size,page:n};}
export function houseHealth(devices,alerts){if(alerts.some(a=>a.state!=='RESOLVED'&&['HIGH','CRITICAL'].includes(a.severity)))return 'ALERT';if(devices.some(d=>d.status==='OFFLINE'))return 'OFFLINE';if(!devices.length||devices.some(d=>d.status!=='ONLINE'))return 'DEGRADED';return 'HEALTHY';}
