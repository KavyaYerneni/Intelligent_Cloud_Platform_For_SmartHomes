import React from 'react';

export function chartCeiling(values) {
 const peak=Math.max(1,...values);
 const step=10**Math.floor(Math.log10(peak));
 return Math.ceil((peak+1)/step)*step;
}

export default function ActivityCharts({audio,generatedAt}) {
 const days=audio.daily||[];
 const dailyMax=chartCeiling(days.map(x=>x.count));
 const hours=Array.from({length:24},(_,i)=>{
  const date=new Date(generatedAt);date.setUTCMinutes(0,0,0);date.setUTCHours(date.getUTCHours()-23+i);
  return {date,count:audio.hourly.find(x=>new Date(x.hour).getTime()===date.getTime())?.count||0};
 });
 const max=chartCeiling(hours.map(x=>x.count));
 const time=date=>date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',timeZone:audio.timeZone||'America/Los_Angeles'});
 const points=hours.map((x,i)=>`${42+i*23},${155-x.count/max*130}`).join(' ');
 return <section className="activity-charts" aria-label="Sound activity charts">
  <div className="daily-chart"><header><h2>{(days.at(-1)?.count||0).toLocaleString()} <small>sounds today</small></h2><span>Daily totals · last 7 days</span></header>
   <div className="daily-bars" role="img" aria-label={`Daily classified sounds: ${days.map(x=>`${x.day}: ${x.count}`).join(', ')}`}>
    <span className="chart-ceiling">{dailyMax.toLocaleString()}</span>
    {days.map((d,i)=><div className="daily-slot" key={d.day}><div className={`daily-bar ${i===days.length-1?'today':''}`} style={{height:`${d.count/dailyMax*100}%`}} title={`${d.day}: ${d.count.toLocaleString()} sounds`}><span>{d.count.toLocaleString()}</span></div><small>{i===days.length-1?'Today':d.day.slice(5).replace('-','/')}</small></div>)}
   </div><p className="hint">Today grows as recordings are classified. Empty days remain zero.</p>
  </div>
  <div className="hourly-chart"><header><h2>Hourly activity</h2><span>Sounds per hour · last 24 hours</span></header>
   <svg viewBox="0 0 600 185" role="img" aria-label={`Hourly sound counts: ${hours.map(x=>`${time(x.date)}: ${x.count}`).join(', ')}`}>
    {[0,.5,1].map(f=><g key={f}><line x1="42" x2="571" y1={155-f*130} y2={155-f*130} stroke="#e0dfe7"/><text x="34" y={159-f*130} textAnchor="end">{Math.round(max*f)}</text></g>)}
    <polyline points={points} fill="none" stroke="#4837bd" strokeWidth="2.5" strokeLinejoin="round"/>
    {hours.map((x,i)=><g key={x.date.toISOString()}><circle cx={42+i*23} cy={155-x.count/max*130} r="3" fill={i===23?'#a34681':'#4837bd'}><title>{time(x.date)}: {x.count} sounds</title></circle>{i%4===0||i===23?<text x={42+i*23} y="177" textAnchor="middle">{time(x.date)}</text>:null}</g>)}
   </svg><p className="hint">{audio.timeZone||'America/Los_Angeles'} · current hour is still accumulating.</p>
  </div>
 </section>;
}
