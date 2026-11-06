import {scryptSync,randomBytes,timingSafeEqual} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {rows,pool} from './db.js';
import {fail,fingerprint} from './domain.js';
export function passwordHash(value){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(value,salt,64).toString('hex')}`;}
export function passwordMatches(value,hash){const [salt,key]=hash.split(':');return timingSafeEqual(scryptSync(value,salt,64),Buffer.from(key,'hex'));}
function secret(){if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw Error('JWT_SECRET must contain at least 32 characters');return process.env.JWT_SECRET;}
export function tokenFor(user){return jwt.sign({sub:user.id},secret(),{expiresIn:'1h',issuer:'group4-local',audience:'smart-home'});}
export async function actorFor(token){let claims;try{claims=jwt.verify(token,secret(),{algorithms:['HS256'],issuer:'group4-local',audience:'smart-home'});}catch{fail(401,'UNAUTHORIZED','Sign in with a valid session.');}const [u]=await rows("SELECT u.*,t.name AS tenant_name FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.active AND t.status='ACTIVE'",[claims.sub]);if(!u)fail(401,'UNAUTHORIZED','Session is no longer active.');return u;}
export async function authenticate(req,res,next){req.actor=await actorFor((req.headers.authorization||'').replace(/^Bearer /,''));next();}
export function role(actor,...roles){if(!roles.includes(actor.role))fail(403,'FORBIDDEN','Your role cannot perform this action.');}
export function inScope(actor,h){return h.tenant_id===actor.tenant_id&&(!actor.house_ids||actor.house_ids.includes(h.house_id||h.id));}
export async function house(actor,id,c=pool){const {rows:[h]}=await c.query('SELECT * FROM houses WHERE id=$1 AND tenant_id=$2',[id,actor.tenant_id]);if(!h||!inScope(actor,h))fail(403,'HOUSE_SCOPE','House is outside your authorized scope.');return h;}
export async function device(actor,id,c=pool){const {rows:[d]}=await c.query('SELECT * FROM devices WHERE id=$1 AND tenant_id=$2',[id,actor.tenant_id]);if(!d||!inScope(actor,d))fail(403,'DEVICE_SCOPE','Device is outside your authorized scope.');return d;}
export async function audit(c,actor,action,target,houseId,detail={},correlationId='local'){await c.query('INSERT INTO audit_log(tenant_id,house_id,actor,action,target,detail,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor.tenant_id,houseId,actor.id,action,target,detail,correlationId]);}
export async function live(c,actor,houseId,type,payload,correlationId='local'){await c.query('INSERT INTO live_events(tenant_id,house_id,type,payload,correlation_id) VALUES($1,$2,$3,$4,$5)',[actor.tenant_id,houseId,type,payload,correlationId]);}
export async function deviceActor(req,res,next){if(req.headers.authorization?.startsWith('Device ')){const hash=fingerprint(req.headers.authorization.slice(7));const [d]=await rows("SELECT * FROM devices WHERE credential_hash=$1 AND status <> 'ARCHIVED'",[hash]);if(!d)fail(401,'DEVICE_AUTH','Invalid or revoked device credential.');req.actor={id:d.id,tenant_id:d.tenant_id,house_ids:[d.house_id],role:'device',deviceId:d.id};}else{await authenticate(req,res,()=>{});}next();}
