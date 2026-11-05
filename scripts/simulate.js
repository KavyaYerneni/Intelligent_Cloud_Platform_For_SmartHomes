import {randomUUID} from 'node:crypto';
const base=process.env.API_URL||'http://127.0.0.1:3000';
const auth=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'technician@demo.local',password:process.env.DEMO_PASSWORD})});
if(!auth.ok)throw Error('Simulator login failed. Check DEMO_PASSWORD and seed.');const {token}=await auth.json();
async function request(path,body){const r=await fetch(`${base}/api/v1${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value;}
const deviceId=process.env.DEVICE_ID||'D001';const device=await request(`/devices/${deviceId}`);
async function beat(){const d=await request(`/devices/${deviceId}`);await request(`/devices/${deviceId}/heartbeat`,{timestamp:new Date().toISOString(),firmware:'simulator-1.0',reportedVersion:d.configVersion,metrics:{battery:98}});}
await beat();const eventId=randomUUID();const event={eventId,correlationId:randomUUID(),houseId:device.houseId,deviceId,type:process.env.EVENT_TYPE||'smoke_alarm',occurredAt:new Date().toISOString(),source:'simulator',confidence:.94,payload:{synthetic:true},modelVersion:'v1'};
console.log('SIMULATED event',await request('/events',event));console.log('Idempotent replay',await request('/events',event));
if(process.argv.includes('--continuous')){console.log('Heartbeats every 10 seconds; Ctrl+C demonstrates offline timeout.');setInterval(()=>beat().catch(e=>console.error(e.message)),10000);}
