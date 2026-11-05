let token='';
export function setToken(value){token=value;}
export const getToken=()=>token;
export async function api(path,options={}){const response=await fetch(`/api/v1${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});let body;try{body=await response.json();}catch{throw Error('The server is unavailable. Please retry.');}if(!response.ok){const error=Error(`${body.message} ${(body.fieldErrors||[]).map(e=>`${e.field}: ${e.message}`).join('; ')}`);error.status=response.status;throw error;}return body;}
export const send=(path,body,method='POST',key)=>api(path,{method,body,headers:key?{'Idempotency-Key':key}:{}});
export const date=value=>value?new Date(value).toLocaleString():'Not yet';
export const timeWindow=()=>({from:new Date(Date.now()-86400000).toISOString(),to:new Date(Date.now()+60000).toISOString()});
