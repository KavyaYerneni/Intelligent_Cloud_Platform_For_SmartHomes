import React from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, when } from '../../lib/format';
import { Drawer } from '../../ui/Overlay';
import Status from '../../ui/Status';
import { Empty, ErrorBox, Skeleton } from '../../ui/Feedback';
import { useApp } from '../../app/context';

/** Selected-house drawer (C1 §5.2 storyboard step 3). */
export default function HouseDrawer({ house: h, onClose }) {
  const { live, go } = useApp();
  const timeline = useLoad(() => api(`/houses/${h.id}/timeline`, { query: { from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 60000).toISOString(), pageSize: 15 } }), [h.id, live.version]);
  const rooms = [...new Set(h.devices.map(d => d.roomName))];
  return (
    <Drawer title={h.name} subtitle={h.address} onClose={onClose} actions={<Status value={h.health} />}>
      <section className="drawer-section">
        <h3>Open alerts</h3>
        {h.alerts.length ? h.alerts.map(a => (
          <button key={a.id} className="line-item line-btn" onClick={() => go('alerts', a.id)}>
            <Status value={a.severity} />
            <span className="grow"><strong>{human(a.type)}</strong><small>{a.deviceName}, {ago(a.createdAt)}</small></span>
            <Status value={a.state} quiet />
          </button>
        )) : <p className="muted">No open alerts.</p>}
      </section>
      <section className="drawer-section">
        <h3>Devices</h3>
        {!h.devices.length && <Empty title="No devices yet"><button className="btn btn-sm" onClick={() => go('inventory')}>Register a device</button></Empty>}
        {rooms.map(room => (
          <div key={room} className="room-group">
            <h4>{room}</h4>
            {h.devices.filter(d => d.roomName === room).map(d => (
              <button key={d.id} className="line-item line-btn" onClick={() => go('inventory', d.id)}>
                <span className="grow"><strong>{d.name}</strong><small>{human(d.type)}, last heartbeat {ago(d.lastSeen)}</small></span>
                <Status value={d.status} />
              </button>
            ))}
          </div>
        ))}
      </section>
      <section className="drawer-section">
        <h3>Last 24 hours</h3>
        {timeline.loading ? <Skeleton rows={3} /> : timeline.error ? <ErrorBox error={timeline.error} onRetry={timeline.reload} />
          : timeline.data.items.length ? (
            <ol className="timeline">
              {timeline.data.items.map(e => (
                <li key={e.id}><span className="t-when">{when(e.occurredAt, h.timezone)}</span><span>{human(e.type)}</span><Status value={e.processingState} quiet /></li>
              ))}
            </ol>
          ) : <p className="muted">No events in the last 24 hours.</p>}
      </section>
    </Drawer>
  );
}
