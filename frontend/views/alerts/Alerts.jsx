import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human } from '../../lib/format';
import Status from '../../ui/Status';
import { Empty, ErrorBox, Skeleton, StaleNote } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import AlertDetail from './AlertDetail';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM'];
const STATES = ['ACTIVE', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED'];
const PAGE = 20;

export default function Alerts({ arg }) {
  const { live, house, go } = useApp();
  const q = new URLSearchParams(location.search);
  const [severity, setSeverity] = useState(q.get('severity') || '');
  const [state, setState] = useState(q.get('state') || '');
  const [page, setPage] = useState(1);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState(0);
  const liveKey = paused ? frozen : live.version;
  const list = useLoad(() => api('/alerts', { query: { houseId: house || undefined, severity: severity || undefined, state: state || undefined, page, pageSize: PAGE } }), [house, severity, state, page, liveKey]);

  // Filters are kept in the URL so a filtered queue can be shared (C3 §5.3).
  const filter = (key, value, set) => {
    set(value); setPage(1);
    const p = new URLSearchParams(location.search); value ? p.set(key, value) : p.delete(key);
    history.replaceState(null, '', `${location.pathname}${p.size ? '?' + p : ''}${location.hash}`);
  };
  const pages = Math.max(1, Math.ceil((list.data?.total || 0) / PAGE));

  return (
    <div className="split-alerts">
      <section className="panel queue" aria-labelledby="q-h">
        <header className="panel-head">
          <h2 id="q-h">Queue</h2>
          <button className={`btn btn-sm ${paused ? 'btn-primary' : ''}`} onClick={() => { setFrozen(live.version); setPaused(!paused); }} aria-pressed={paused}>
            {paused ? 'Resume live updates' : 'Pause live updates'}
          </button>
        </header>
        <div className="filters">
          <label className="sr-only" htmlFor="f-sev">Severity</label>
          <select id="f-sev" value={severity} onChange={e => filter('severity', e.target.value, setSeverity)}>
            <option value="">All severities</option>{SEVERITIES.map(s => <option key={s} value={s}>{human(s)}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-state">State</label>
          <select id="f-state" value={state} onChange={e => filter('state', e.target.value, setState)}>
            <option value="">All states</option>{STATES.map(s => <option key={s} value={s}>{human(s)}</option>)}
          </select>
        </div>
        {paused && <p className="banner banner-warn">Paused. New alerts are still recorded; resume to see them.</p>}
        <StaleNote error={list.error} at={list.at} />
        {list.loading ? <Skeleton rows={5} label="Loading alerts" /> : !list.data ? <ErrorBox error={list.error} onRetry={list.reload} />
          : !list.data.items.length ? <Empty title={severity || state ? 'No alerts match these filters' : 'No alerts'}>{!severity && !state && 'Alerts appear here when a device or the simulator reports an event that meets an alert rule.'}</Empty>
          : (
            <ul className="queue-list">
              {list.data.items.map(a => (
                <li key={a.id}>
                  <a href={`#alerts/${a.id}`} className={`q-item sev-${a.severity.toLowerCase()} ${a.state === 'RESOLVED' ? 'q-done' : ''} ${arg === a.id ? 'on' : ''}`} aria-current={arg === a.id ? 'true' : undefined}>
                    <span className="q-top"><strong>{human(a.type)}</strong><span className="q-age">{ago(a.createdAt)}</span></span>
                    <span className="q-where">{a.houseName}, {a.deviceName}{a.evidenceCount > 1 ? `, ${a.evidenceCount} events` : ''}</span>
                    <span className="row"><Status value={a.severity} /><Status value={a.state} quiet />{a.assigneeEmail && <span className="q-assignee">{a.assigneeEmail}</span>}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        {pages > 1 && (
          <nav className="pager" aria-label="Alert pages">
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}
      </section>
      <div className="alert-pane">
        {arg ? <AlertDetail key={arg} id={arg} onChanged={list.reload} />
          : <div className="panel pane-empty"><Empty title="Select an alert">Pick an alert from the queue to see its evidence, history and the actions your role can take.</Empty>
              {list.data?.items[0] && <button className="btn btn-primary" onClick={() => go('alerts', list.data.items[0].id)}>Open the top alert</button>}</div>}
      </div>
    </div>
  );
}
