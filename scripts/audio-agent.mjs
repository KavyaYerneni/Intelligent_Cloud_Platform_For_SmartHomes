#!/usr/bin/env node
// AUDIO AGENT: a simulated microphone that replays recorded WAV files.
// The device is simulated; the classification is real (the trained model in ml/).
// Audio is read from your disk and sent to the platform API only.
//
//   npm run audio-agent -- --dir ~/Downloads/dataset --device D001
//   npm run audio-agent -- --dir ~/Downloads/dataset --device D001 --interval 5 --shuffle --loop
//   npm run audio-agent -- --dir ~/Downloads/dataset --device D-... --credential <device credential>
//
// Options:
//   --dir <folder>       folder of .wav files (searched recursively)          required
//   --device <id>        microphone device ID                                 default D001
//   --interval <s>       seconds between clips                               default 10
//   --limit <n>          stop after n clips                                    default all
//   --shuffle            random order instead of sorted
//   --loop               start again after the last clip
//   --credential <c>     device credential (Houses & devices > device > Access). Without it
//                        the agent signs in as --email with DEMO_PASSWORD (needs SIMULATOR_ENABLED=true)
//   --email <e>          default technician@demo.local
//   --api <url>          default API_URL or http://127.0.0.1:3000
import {readdir,readFile,stat} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';

function parse(argv){
 const o={device:'D001',interval:10,limit:0,shuffle:false,loop:false,email:'technician@demo.local',api:process.env.API_URL||'http://127.0.0.1:3000',credential:process.env.DEVICE_CREDENTIAL||''};
 for(let i=0;i<argv.length;i++){
  const k=argv[i].replace(/^--/,'');
  if(['shuffle','loop'].includes(k))o[k]=true;
  else if(k==='help'||k==='h'){o.help=true;}
  else o[k]=argv[++i];
 }
 o.interval=Number(o.interval);o.limit=Number(o.limit);
 if(o.dir)o.dir=resolve(o.dir.replace(/^~(?=$|\/)/,homedir()));
 return o;
}
const opt=parse(process.argv.slice(2));
if(opt.help||!opt.dir){console.log(`Usage: npm run audio-agent -- --dir <folder of .wav files> [--device D001] [--interval 10] [--shuffle] [--loop] [--limit n] [--credential c]`);process.exit(opt.help?0:1);}

async function wavFiles(dir){
 const out=[];
 for(const e of await readdir(dir,{withFileTypes:true})){
  const p=join(dir,e.name);
  if(e.isDirectory())out.push(...await wavFiles(p));
  else if(/\.wav$/i.test(e.name))out.push(p);
 }
 return out;
}

let auth='';
async function signIn(){
 if(opt.credential){auth=`Device ${opt.credential}`;return 'device credential';}
 if(!process.env.DEMO_PASSWORD)throw Error('Set DEMO_PASSWORD (in .env) or pass --credential.');
 const r=await fetch(`${opt.api}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:opt.email,password:process.env.DEMO_PASSWORD})});
 if(!r.ok)throw Error(`Sign-in as ${opt.email} failed (${r.status}).`);
 auth=`Bearer ${(await r.json()).token}`;return opt.email;
}
async function api(path,init={}){
 const r=await fetch(`${opt.api}/api/v1${path}`,{...init,headers:{Authorization:auth,...init.headers}});
 let body={};try{body=await r.json();}catch{}
 return {status:r.status,body};
}

let reported;
async function heartbeat(){
 const r=await api(`/devices/${opt.device}/heartbeat`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({timestamp:new Date().toISOString(),firmware:'audio-agent-1.0',metrics:{},...(reported!==undefined?{reportedVersion:reported}:{})})});
 if(r.status===200)reported=r.body.desiredVersion; // simulated device applies the desired configuration
 else console.log(`  heartbeat refused: ${r.body.message||r.status}`);
}

const stats={sent:0,alerts:0,failed:0,labels:{}};
const time=()=>new Date().toLocaleTimeString('en-US',{hour12:false});
async function send(file){
 const wav=await readFile(file);
 const eventId=`aud-${randomUUID()}`;
 for(let attempt=1;attempt<=3;attempt++){
  let r;
  try{r=await api(`/devices/${opt.device}/audio`,{method:'POST',body:wav,headers:{'Content-Type':'audio/wav','X-Event-Id':eventId,'X-Captured-At':new Date().toISOString()}});}
  catch{r={status:0,body:{message:'API not reachable'}};}
  if(r.status===202||r.status===200){
   const i=r.body.inference||{};
   stats.sent++;stats.labels[i.label]=(stats.labels[i.label]||0)+1;
   if(r.body.alertPreview)stats.alerts++;
   const alert=r.body.alertPreview?`  ALERT ${r.body.alertPreview}`:'';
   console.log(`[${time()}] ${relative(opt.dir,file)}  ->  ${i.label} ${Math.round((i.confidence||0)*100)}%  (${String(i.eventType).replaceAll('_',' ')})${alert}${i.testEmbedder?'  [TEST EMBEDDER, NOT REAL]':''}`);
   return;
  }
  // Inference temporarily unavailable: keep the clip and retry with the same event ID.
  if((r.status===503||r.status===0)&&attempt<3){console.log(`  ${r.body.message} Retrying in ${attempt*3}s with the same event ID.`);await new Promise(s=>setTimeout(s,attempt*3000));continue;}
  stats.failed++;console.log(`[${time()}] ${relative(opt.dir,file)}  ->  refused: ${r.body.code||r.status} ${r.body.message||''}`);return;
 }
}

function summary(){
 console.log(`\n${stats.sent} clips classified, ${stats.alerts} would raise alerts, ${stats.failed} failed.`);
 for(const [l,n] of Object.entries(stats.labels).sort((a,b)=>b[1]-a[1]))console.log(`  ${String(n).padStart(4)}  ${l}`);
}
process.on('SIGINT',()=>{summary();process.exit(0);});

const files=await wavFiles(opt.dir);
if(!files.length){console.error(`No .wav files found under ${opt.dir}`);process.exit(1);}
const who=await signIn();
console.log(`AUDIO AGENT (simulated microphone replaying recorded files; classification by the trained model)`);
console.log(`${files.length} WAV files in ${opt.dir}. Device ${opt.device}, one clip every ${opt.interval}s, signed in with ${who}. Ctrl+C to stop.\n`);
const big=await Promise.all(files.map(async f=>(await stat(f)).size>6*1024*1024));
let queue=files.filter((_,i)=>!big[i]);
if(queue.length<files.length)console.log(`Skipping ${files.length-queue.length} files larger than 6 MB.`);
let n=0;
do{
 const order=opt.shuffle?[...queue].sort(()=>Math.random()-.5):[...queue].sort();
 for(const f of order){
  await heartbeat();
  await send(f);
  if(opt.limit&&++n>=opt.limit){summary();process.exit(0);}
  await new Promise(s=>setTimeout(s,opt.interval*1000));
 }
}while(opt.loop);
summary();
