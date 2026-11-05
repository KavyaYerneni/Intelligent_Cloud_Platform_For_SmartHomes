import {processOne,processNotifications,expireDevices,persistHeartbeats,pruneLiveEvents} from './processing.js';
import {close} from './db.js';
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
let ticks=0;
while(!stopping){try{for(let i=0;i<25&&await processOne();i++);await processNotifications();await expireDevices();await persistHeartbeats();if(++ticks%600===0)await pruneLiveEvents();}catch(e){console.error(JSON.stringify({component:'worker',error:e.code||e.name,time:new Date().toISOString()}));}await new Promise(r=>setTimeout(r,1000));}
await close();
