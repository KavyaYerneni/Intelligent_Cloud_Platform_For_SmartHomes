import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, when } from '../../lib/format';
import Status from '../../ui/Status';
import { Empty, ErrorBox, Skeleton, StaleNote } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { sourceLabel } from '../../lib/source';
import HouseMap from './HouseMap';
import AudioOverview from './AudioOverview';
import HouseDrawer from './HouseDrawer';
import { needsAttention, reason } from './health';

export default function Overview() {
  const { live, house, go, user, setHouse } = useApp();
  const [open, setOpen] = useState('');
  const snap = useLoad(() => api('/dashboard/summary', { query: { houseId: house || undefined } }), [house, live.version]);

  if (snap.loading) return <div className="grid-overview"><Skeleton rows={6} label="Loading the community overview" /></div>;
  if (!snap.data) return <ErrorBox error={snap.error} onRetry={snap.reload} />;
  const s = snap.data;
  const attention = needsAttention(s.houses);
  const clear = s.houses.length - attention.length;
  const opened = s.houses.find(h => h.id === open);

  return (
    <>
      <StaleNote error={snap.error} at={snap.at} />
      <AudioOverview snapshot={s} />
      <div className="grid-overview">
        <section className="panel attention" aria-labelledby="att-h">
          <header className="panel-head"><h2 id="att-h">Needs attention</h2><span className="count-pill">{attention.length}</span></header>
          {!s.houses.length && <Empty title="No houses yet"><button className="btn btn-primary btn-sm" onClick={() => go('inventory')}>Add a house</button></Empty>}
          <ol className="att-list">
            {attention.map(h => (
              <li key={h.id} className={`att tone-${h.health === 'ALERT' ? 'bad' : h.health === 'OFFLINE' ? 'muted' : 'warn'}`}>
                <button className="att-main" onClick={() => setOpen(h.id)}>
                  <span className="att-top"><strong>{h.name}</strong>{h.health === 'HEALTHY' ? <Status value={h.alerts[0].severity} label={`${h.alerts[0].severity === 'MEDIUM' ? 'Medium' : 'Info'} alert`} /> : <Status value={h.health} />}</span>
                  <span className="att-reason">{reason(h)}</span>
                </button>
                {h.alerts[0] && <button className="btn btn-sm" onClick={() => go('alerts', h.alerts[0].id)}>Open alert</button>}
                {['operator', 'technician'].includes(user.role) && h.devices.some(d => d.status === 'REGISTERED' && !d.lastSeen) && (
                  <button className="btn btn-sm" onClick={() => { setHouse(h.id); go('simulator'); }}>Open device simulator</button>
                )}
              </li>
            ))}
          </ol>
          {s.houses.length > 0 && (
            <p className="all-clear"><span className="mark mark-dot" aria-hidden="true" />
              {clear === 0 ? 'No house is all clear right now.' : `${clear} ${clear === 1 ? 'house is' : 'houses are'} all clear: devices reporting, no open alerts.`}
            </p>
          )}
        </section>
        <section className="panel map-panel" aria-label="House map">
          <HouseMap houses={s.houses} selected={open} onSelect={setOpen} />
        </section>
      </div>

      <dl className="strip">
        <div><dt>Houses</dt><dd>{s.totals.houses}</dd></div>
        <div><dt>Devices online</dt><dd className="ok">{s.totals.onlineDevices}</dd></div>
        <div><dt>Devices offline</dt><dd className={s.totals.offlineDevices ? 'muted-strong' : ''}>{s.totals.offlineDevices}</dd></div>
        <div><dt>Open alerts</dt><dd className={s.totals.activeAlerts ? 'bad' : ''}>{s.totals.activeAlerts}</dd></div>
        <div className="strip-note">Snapshot {when(s.generatedAt)}</div>
      </dl>

      <div className="grid-two">
        <section className="panel" aria-labelledby="ht-h">
          <header className="panel-head"><h2 id="ht-h">Houses</h2></header>
          <div className="table-wrap">
            <table>
              <thead><tr><th>House</th><th>Status</th><th>Devices online</th><th>Open alerts</th><th>Last heartbeat</th></tr></thead>
              <tbody>
                {s.houses.map(h => (
                  <tr key={h.id} className={open === h.id ? 'row-on' : ''}>
                    <td><button className="link" onClick={() => setOpen(h.id)}>{h.name}</button></td>
                    <td><Status value={h.health} /></td>
                    <td>{h.devices.filter(d => d.status === 'ONLINE').length} of {h.devices.length}</td>
                    <td>{h.activeAlertCount || 'None'}</td>
                    <td title={when(h.lastSeen, h.timezone)}>{ago(h.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" aria-labelledby="ra-h">
          <header className="panel-head"><h2 id="ra-h">Recent activity</h2><span className="muted">Last 24 hours</span></header>
          {s.recentEvents.length ? (
            <ol className="activity">
              {s.recentEvents.map(e => (
                <li key={e.id}>
                  <span className={`act-mark act-${e.type}`} aria-hidden="true" />
                  <span className="grow"><strong>{e.soundLabel || human(e.type)}</strong><small>{e.deviceName} at {e.houseName}, {sourceLabel(e.source)}{e.confidence !== null ? `, ${Math.round(e.confidence * 100)}% confidence` : ''}</small></span>
                  <span className="act-time">{ago(e.occurredAt)}</span>
                </li>
              ))}
            </ol>
          ) : <Empty title="Nothing in the last 24 hours">Events from devices and the simulator appear here as they arrive.</Empty>}
        </section>
      </div>
      {opened && <HouseDrawer house={opened} onClose={() => setOpen('')} />}
    </>
  );
}
