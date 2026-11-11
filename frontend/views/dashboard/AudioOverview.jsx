import React from 'react';
import ActivityCharts from './ActivityCharts';
import { human, ago } from '../../lib/format';

export default function AudioOverview({ snapshot:s }) {
 const a=s.audio||{count:0,sounds:[],hourly:[]};
 const colors=['#4837bd','#a34681','#477eab','#b28b49','#758575'];
 let offset=0;
 const segments=a.sounds.slice(0,4).map((x,i)=>{const start=offset;offset+=x.count/(a.count||1)*100;return `${colors[i]} ${start}% ${offset}%`;});
 segments.push(`#e5e4eb ${offset}% 100%`);
 return <>
  <ActivityCharts audio={a} generatedAt={s.generatedAt} />
  <div className="audio-insights">
   <section className="sound-mix"><h2>Sound distribution</h2><div className="mix-body"><div className="sound-ring" style={{background:`conic-gradient(${segments.join(',')})`}} role="img" aria-label="Sound distribution, counts in adjacent legend"><div><strong>{a.categories || 0}</strong><span>sound categories</span></div></div><ul>{a.sounds.slice(0,4).map((x,i)=><li key={x.label}><i style={{background:colors[i]}}/>{x.label}<b>{x.count}</b></li>)}{a.count>a.sounds.slice(0,4).reduce((n,x)=>n+x.count,0)&&<li><i style={{background:'#e5e4eb'}}/>Other sounds<b>{a.count-a.sounds.slice(0,4).reduce((n,x)=>n+x.count,0)}</b></li>}{!a.count&&<li>Awaiting recordings</li>}</ul></div></section>
   <dl className="monitor-metrics"><div><dt>Devices reporting</dt><dd>{s.totals.onlineDevices}<small> / {s.houses.reduce((n,h)=>n+h.devices.length,0)}</small></dd></div><div><dt>Average model score</dt><dd>{a.confidence==null?'—':`${(a.confidence*100).toFixed(1)}%`}</dd><small>Confidence, not measured accuracy</small></div><div><dt>Open alerts</dt><dd>{s.totals.activeAlerts}</dd></div><div><dt>Monitored rooms</dt><dd>{new Set(s.houses.flatMap(h=>h.devices.map(d=>d.roomId))).size}</dd></div></dl>
  </div>
  <section className="panel sound-feed"><header className="panel-head"><div><p className="eyebrow">AS SOUNDS ARRIVE</p><h2>Live monitoring</h2></div><span className="muted">Latest 15 events · last 24 hours</span></header><div className="table-wrap"><table><colgroup><col style={{width:'32%'}}/><col style={{width:'20%'}}/><col style={{width:'14%'}}/><col style={{width:'23%'}}/><col style={{width:'11%'}}/></colgroup><thead><tr><th>Predicted sound</th><th>Location</th><th>Confidence</th><th>Alert decision</th><th>Time</th></tr></thead><tbody>{s.recentEvents.map(e=><tr key={e.id}><td><strong>{e.soundLabel||human(e.type)}</strong><small className="sub">{e.modelName||e.source}{e.inputOrigin==='recorded-dataset'?' / Recorded audio':''}</small></td><td>{e.roomName}<small className="sub">{e.houseName}</small></td><td>{e.confidence==null?'—':<><strong>{(e.confidence*100).toFixed(1)}%</strong><meter min="0" max="1" value={e.confidence} aria-label={`${e.soundLabel||e.type} confidence`}/></>}</td><td>{e.alertSeverity || 'No alert'}<small className="sub">{e.processingState==='PENDING'?'Processing alert rules':e.processingState==='QUARANTINED'?'Needs data review':'Rules processed'}</small></td><td>{ago(e.occurredAt)}</td></tr>)}</tbody></table>{!s.recentEvents.length&&<p className="feed-empty">Waiting for sound events. Recorded dataset playback and connected devices appear here.</p>}</div></section>
  <section className="room-section"><header className="panel-head"><h2>Rooms at a glance</h2><span className="muted">Device connection status</span></header><div className="room-grid">{s.houses.flatMap(h=>h.devices.map(d=><div className="room-tile" key={d.id}><span className={`room-dot ${d.status==='ONLINE'?'reporting':''}`}/><strong>{d.roomName}</strong><small>{h.name}</small><span>{human(d.status)}</span></div>))}</div></section>
 </>;
}
