import {WebSocketServer} from 'ws';
import {actorFor,house,inScope} from './security.js';
import {rows} from './db.js';

export function attachLive(server) {
  const wss = new WebSocketServer({server,maxPayload:4096});
  wss.on('connection',(ws,req) => {
    const path = new URL(req.url,'http://local').pathname;
    if(!['/ws/monitoring','/ws/alerts','/ws/device-status'].includes(path)) {
      ws.close(1008,'Unknown subscription');
      return;
    }
    let actor=null, token=null, ids=null, cursor=0, busy=false;
    const timeout=setTimeout(()=>ws.close(1008,'Authentication required'),5000);
    ws.once('message',async raw => {
      try {
        const body=JSON.parse(raw);
        token=body.token;
        const verified=await actorFor(token);
        ids=Array.isArray(body.houseIds)&&body.houseIds.length?body.houseIds:verified.house_ids;
        if(ids) {
          if(ids.length>100)throw Error('Too many subscriptions');
          for(const id of ids)await house(verified,id);
        }
        const [v]=await rows('SELECT COALESCE(max(id),0) AS version FROM live_events');
        cursor=Number(v.version);
        actor=verified;
        clearTimeout(timeout);
        ws.send(JSON.stringify({type:'CONNECTED',version:cursor}));
      } catch {
        actor=null;
        ws.close(1008,'Unauthorized subscription');
      }
    });
    const timer=setInterval(async()=>{
      if(!actor||busy||ws.readyState!==1)return;
      busy=true;
      try {
        actor=await actorFor(token);
        const messages=await rows('SELECT * FROM live_events WHERE id>$1 AND tenant_id=$2 AND ($3::text[] IS NULL OR house_id=ANY($3)) ORDER BY id LIMIT 100',[cursor,actor.tenant_id,ids]);
        for(const m of messages) {
          cursor=Number(m.id);
          if(!inScope(actor,m))continue;
          if(ws.bufferedAmount>1024*1024) { ws.close(1013,'Refresh snapshot'); break; }
          ws.send(JSON.stringify({type:m.type,eventId:String(m.id),version:Number(m.id),houseId:m.house_id,occurredAt:m.created_at,correlationId:m.correlation_id,payload:m.payload}));
        }
        if(ws.readyState===1)ws.send(JSON.stringify({type:'HEARTBEAT',occurredAt:new Date().toISOString()}));
      } catch(error) {
        ws.close(error.status===401?1008:1011,error.status===401?'Session expired':'Data service unavailable');
      } finally { busy=false; }
    },1000);
    ws.on('close',()=>{clearInterval(timer);clearTimeout(timeout);});
  });
  return wss;
}
