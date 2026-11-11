// Client for the internal inference service (ml/). The browser never calls it;
// every request goes through the Node API, which enforces role and house scope.
const base=()=>(process.env.ML_SERVICE_URL||'http://127.0.0.1:8000').replace(/\/$/,'');
const timeoutMs=()=>Number(process.env.ML_TIMEOUT_MS||20000);

export class MlError extends Error{
 constructor(status,code,message){super(message);this.status=status;this.code=code;}
}

async function call(path,{method='GET',body,headers={}}={}){
 let r;
 try{
  r=await fetch(base()+path,{method,body,signal:AbortSignal.timeout(timeoutMs()),
   headers:{...(process.env.ML_SERVICE_TOKEN?{'X-Service-Token':process.env.ML_SERVICE_TOKEN}:{}),...headers}});
 }catch(e){
  throw new MlError(503,e.name==='TimeoutError'?'AI_TIMEOUT':'AI_UNAVAILABLE',
   e.name==='TimeoutError'?'The inference service did not answer in time.':'The inference service is not reachable.');
 }
 let data={};try{data=await r.json();}catch{}
 if(!r.ok)throw new MlError(r.status>=500?503:r.status,data.code||'AI_ERROR',data.message||`Inference service returned ${r.status}.`);
 return data;
}

// The model list changes only on redeploy; cache briefly to keep pages fast.
let cache={at:0,value:null};
export async function listModels({fresh=false}={}){
 if(!fresh&&cache.value&&Date.now()-cache.at<10000)return cache.value;
 const value=await call('/models');cache={at:Date.now(),value};return value;
}
export const resetModelCache=()=>{cache={at:0,value:null};};
export const health=()=>call('/health');
export function classify(wav,{name,version}){
 return call(`/classify?model=${encodeURIComponent(name)}&version=${encodeURIComponent(version)}`,
  {method:'POST',body:wav,headers:{'Content-Type':'audio/wav'}});
}
