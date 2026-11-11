import React from 'react';
import { useApp } from '../../app/context';
import { can } from '../../lib/roles';
import { human, ago } from '../../lib/format';

export default function AudioOverview({ snapshot:s }) {
 const {user}=useApp();
 const a=s.audio||{count:0,sounds:[],hourly:[]};
 const hours=Array.from({length:24},(_,i)=>{const t=new Date(s.generatedAt);t.setMinutes(0,0,0);t.setHours(t.getHours()-23+i);return {time:t,count:a.hourly.find(x=>new Date(x.hour).getTime()===t.getTime())?.count||0};});
 const max=Math.max(1,...hours.map(x=>x.count));
 const colors=['#4837bd','#a34681','#477eab','#b28b49','#758575'];
 let offset=0;
 const segments=a.sounds.slice(0,4).map((x,i)=>{const start=offset;offset+=x.count/(a.count||1)*100;return `${colors[i]} ${start}% ${offset}%`;});
 segments.push(`#e5e4eb ${offset}% 100%`);
 return <>
  <section className="audio-hero" aria-label="Audio monitoring summary">
   <div className="hero-number"><p className="eyebrow">COMMUNITY / SOUND MONITORING</p><h2>{a.count.toLocaleString()}</h2><p>sounds classified in the last 24 hours</p><p className="hero-context">A room-by-room view of what your homes are hearing. Predictions and alert decisions are shown separately.</p>{can(user,'aiView')&&<a href="#ai">Explore models & accuracy ↗</a>}</div>
   <div className="audio-chart"><header><h2>Listening activity</h2><span>Last 24 hours · local time</span></header><div className="bar-chart" role="img" aria-label={`Hourly classified sounds. ${a.count} total; peak ${max===1&&!a.count?0:max} per hour.`}>{hours.map((x,i)=><div className="bar-slot" key={i}><div className="audio-bar" style={{height:`${x.count/max*100}%`,background:i===23?'#a34681':'#4837bd'}} title={`${x.time.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}: ${x.count} sounds`} /><small>{i%4===0?x.time.getHours().toString().padStart(2,'0'):''}</small></div>)}</div><p className="hint">{a.count?'Hover a bar for the count.':'No audio received yet. Start dataset playback or upload a WAV in the simulator.'}</p><details><summary>Hourly counts</summary><div className="hourly-counts">{hours.map((x,i)=><span key={i}>{x.time.getHours()}:00 — {x.count}</span>)}</div></details></div>
  </section>
  <div className="audio-insights">
   <section className="sound-mix"><h2>Sound distribution</h2><div className="mix-body"><div className="sound-ring" style={{background:`conic-gradient(${segments.join(',')})`}} role="img" aria-label="Sound distribution, counts in adjacent legend"><div><strong>{a.categories || 0}</strong><span>sound categories</span></div></div><ul>{a.sounds.slice(0,4).map((x,i)=><li key={x.label}><i style={{background:colors[i]}}/>{x.label}<b>{x.count}</b></li>)}{a.count>a.sounds.slice(0,4).reduce((n,x)=>n+x.count,0)&&<li><i style={{background:'#e5e4eb'}}/>Other sounds<b>{a.count-a.sounds.slice(0,4).reduce((n,x)=>n+x.count,0)}</b></li>}{!a.count&&<li>Awaiting recordings</li>}</ul></div></section>
   <dl className="monitor-metrics"><div><dt>Devices reporting</dt><dd>{s.totals.onlineDevices}<small> / {s.houses.reduce((n,h)=>n+h.devices.length,0)}</small></dd></div><div><dt>Average model score</dt><dd>{a.confidence==null?'—':`${(a.confidence*100).toFixed(1)}%`}</dd><small>Confidence, not measured accuracy</small></div><div><dt>Open alerts</dt><dd>{s.totals.activeAlerts}</dd></div><div><dt>Monitored rooms</dt><dd>{new Set(s.houses.flatMap(h=>h.devices.map(d=>d.roomId))).size}</dd></div></dl>
  </div>
  <section className="panel sound-feed"><header className="panel-head"><div><p className="eyebrow">AS SOUNDS ARRIVE</p><h2>Live monitoring</h2></div><span className="muted">Latest 15 events · last 24 hours</span></header><div className="table-wrap"><table><thead><tr><th>Predicted sound</th><th>Location</th><th>Confidence</th><th>Alert decision</th><th>Time</th></tr></thead><tbody>{s.recentEvents.map(e=><tr key={e.id}><td><strong>{e.soundLabel||human(e.type)}</strong><small className="sub">{e.modelName||e.source}{e.inputOrigin==='recorded-dataset'?' / Recorded audio':''}</small></td><td>{e.roomName}<small className="sub">{e.houseName}</small></td><td>{e.confidence==null?'—':<><strong>{(e.confidence*100).toFixed(1)}%</strong><meter min="0" max="1" value={e.confidence} aria-label={`${e.soundLabel||e.type} confidence`}/></>}</td><td>{e.alertSeverity || 'No alert'}<small className="sub">{e.processingState==='PENDING'?'Processing alert rules':e.processingState==='QUARANTINED'?'Needs data review':'Rules processed'}</small></td><td>{ago(e.occurredAt)}</td></tr>)}</tbody></table>{!s.recentEvents.length&&<p className="feed-empty">Waiting for sound events. Recorded dataset playback and connected devices appear here.</p>}</div></section>
  <section className="room-section"><header className="panel-head"><h2>Rooms at a glance</h2><span className="muted">Device connection status</span></header><div className="room-grid">{s.houses.flatMap(h=>h.devices.map(d=><div className="room-tile" key={d.id}><span className={`room-dot ${d.status==='ONLINE'?'reporting':''}`}/><strong>{d.roomName}</strong><small>{h.name}</small><span>{human(d.status)}</span></div>))}</div></section>
 </>;
}
