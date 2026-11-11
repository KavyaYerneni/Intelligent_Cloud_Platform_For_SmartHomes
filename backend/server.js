import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {rows,pool,dto} from './db.js';
import {passwordMatches,tokenFor,authenticate,audit,role} from './security.js';
import {fail} from './domain.js';
import {inventory} from './inventory.js';
import {alerts} from './alerts.js';
import {data} from './data.js';
import {dashboard} from './dashboard.js';
import {attachLive} from './live.js';
import {ai} from './ai.js';
export const app=express();
app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'data:','https://tile.openstreetmap.org'],'connect-src':["'self'",'ws:','wss:','https://tile.openstreetmap.org'],'script-src':["'self'"],'style-src':["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],'font-src':["'self'",'https://fonts.gstatic.com']}}}));
// Browser tiles require a truthful Referer. Send only the origin, never house
// filters, page paths or credentials. Helmet's default no-referrer blocks OSM.
app.use(helmet.referrerPolicy({policy:'strict-origin'}));
app.use((req,res,next)=>{req.correlationId=/^[a-zA-Z0-9_-]{1,100}$/.test(req.headers['x-correlation-id']??'')?req.headers['x-correlation-id']:randomUUID();res.setHeader('X-Correlation-Id',req.correlationId);next();});
app.use(express.json({limit:'64kb'}));
app.use('/api',rateLimit({windowMs:60000,limit:600,standardHeaders:'draft-8',legacyHeaders:false}));
app.get('/health/ready',async(req,res)=>{try{await pool.query('SELECT 1');res.json({status:'ready'});}catch{res.status(503).json({status:'unavailable'});}});
app.post('/api/v1/auth/login',rateLimit({windowMs:60000,limit:15}),async(req,res)=>{const b=z.object({email:z.string().email(),password:z.string().min(1).max(200)}).strict().parse(req.body);const [u]=await rows('SELECT u.*,t.name AS tenant_name FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.email=$1 AND u.active AND t.status=\'ACTIVE\'',[b.email]);if(!u||!passwordMatches(b.password,u.password_hash))fail(401,'LOGIN_FAILED','Email or password is incorrect.');await audit(pool,u,'SIGNED_IN',u.id,null,{},req.correlationId);res.json({token:tokenFor(u),user:dto(u)});});
app.get('/api/v1/auth/me',authenticate,(req,res)=>res.json(dto(req.actor)));
app.get('/api/v1/users',authenticate,async(req,res)=>{role(req.actor,'operator','responder');res.json({items:(await rows('SELECT id,email,role,house_ids FROM users WHERE tenant_id=$1 AND active',[req.actor.tenant_id])).map(dto)});});
app.use('/api/v1',dashboard,inventory,alerts,data,ai);
app.use('/api',(req,res)=>res.status(404).json({code:'NOT_FOUND',message:'Unknown API route.',correlationId:req.correlationId}));
app.use(express.static(fileURLToPath(new URL('../dist',import.meta.url))));
app.get('/{*path}',(req,res)=>res.sendFile(fileURLToPath(new URL('../dist/index.html',import.meta.url))));
app.use(async(error,req,res,next)=>{let status=error.status||500,code=error.code||'INTERNAL',message=error.message,fieldErrors=error.fieldErrors||[];if(error instanceof z.ZodError){status=400;code='VALIDATION';message='Check the highlighted fields.';fieldErrors=error.issues.map(i=>({field:i.path.join('.'),message:i.message}));}else if(error.code==='23505'){status=409;code='DUPLICATE';message='That name, serial number, or idempotency key is already in use.';}else if(error.code==='23503'||error.code==='23514'){status=400;code='CONSTRAINT';message='Related record or value is invalid.';}if(status>=500){if(error.status===undefined)message='Service unavailable. Retry with the same idempotency key.';console.error(JSON.stringify({error:error.code||error.name,correlationId:req.correlationId}));}if(status===403&&req.actor)try{await audit(pool,req.actor,'ACCESS_DENIED',req.path,null,{code},req.correlationId);}catch{}res.status(status).json({code,message,fieldErrors,correlationId:req.correlationId,timestamp:new Date().toISOString(),...(error.allowedActions?{allowedActions:error.allowedActions}:{}),...(error.existingDeviceId?{existingDeviceId:error.existingDeviceId}:{})});});
export function start(port=Number(process.env.PORT||3000)){const server=createServer(app);attachLive(server);server.listen(port,'0.0.0.0',()=>console.log(`Smart home API: http://localhost:${port}`));return server;}
if(process.argv[1]===fileURLToPath(import.meta.url))start();

