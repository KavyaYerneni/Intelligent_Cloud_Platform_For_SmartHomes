import React, { useMemo, useState } from 'react';
import { api, newId } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, pct, when } from '../../lib/format';
import { can } from '../../lib/roles';
import Status from '../../ui/Status';
import { Confirm } from '../../ui/Overlay';
import { Field, FormError, useSubmit } from '../../ui/Form';
import { Empty, ErrorBox, Skeleton, Tabs, useToast } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { sourceLabel } from '../../lib/source';
import EventDrawer from './EventDrawer';
import { download, toCsv } from './csv';

const PRESETS = [['1h', 'Last hour', 3600e3], ['24h', 'Last 24 hours', 86400e3], ['7d', 'Last 7 days', 7 * 86400e3], ['31d', 'Last 31 days', 31 * 86400e3], ['custom', 'Custom range']];
const TYPES = ['smoke_alarm', 'human_help_sound', 'unusual_sound', 'normal_appliance_sound', 'normal_activity_sound', 'telemetry'];
const toLocalInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function DataOps({ arg }) {
  const { user, live, house, houses } = useApp();
  const ops = can(user, 'dataOps');
  const [tab, setTab] = useState('history');
  const h = houses.find(x => x.id === house);
  return (
    <>
      {ops && <HealthStrip />}
      <Tabs value={tab} onChange={setTab} tabs={[['history', 'Event history'], ...(ops ? [['reconcile', 'Reconciliation'], ['audit', 'Audit log']] : [])]} />
      {tab === 'history' && <History house={h} live={live} />}
      {tab === 'reconcile' && ops && <Reconcile />}
      {tab === 'audit' && ops && <Audit />}
      {arg && <EventDrawer key={arg} id={arg} onClose={() => { location.hash = 'data'; }} />}
    </>
  );
}

function HealthStrip() {
  const { live } = useApp();
  const hl = useLoad(() => api('/data/health'), [live.version]);
  if (hl.loading) return <Skeleton rows={1} />;
  if (!hl.data) return <ErrorBox error={hl.error} onRetry={hl.reload} />;
  const x = hl.data;
  const items = [
    ['PostgreSQL', <Status value={x.postgres} />, 'Workflow records'],
    ['MongoDB', <Status value={x.mongo} />, `Event detail, indexes ${x.indexStatus.toLowerCase()}`],
    ['AI inference', <Status value={x.inference?.status || 'UNAVAILABLE'} label={x.inference?.testOnly ? 'Test mode' : undefined} />, x.inference?.status === 'UNAVAILABLE' ? 'Service not reachable' : x.inference?.testOnly ? 'Test embedder, not real' : 'YAMNet + trained model'],
    ['Waiting to store', x.backlog, x.backlog ? `Oldest ${x.lagSeconds} s` : 'Nothing waiting'],
    ['Quarantined', x.quarantined, x.quarantined ? 'Needs an operator retry' : 'None'],
  ];
  return (
    <dl className="strip health">
      {items.map(([k, v, note]) => <div key={k}><dt>{k}</dt><dd className={(k === 'Quarantined' && x.quarantined) || (k === 'Waiting to store' && x.backlog) ? 'bad' : ''}>{v}</dd><small>{note}</small></div>)}
      <div className="strip-note"><Status value={x.status} label={x.status === 'HEALTHY' ? 'All stores healthy' : 'Degraded'} /><small>Checked {ago(x.checkedAt)}</small></div>
    </dl>
  );
}

function History({ house, live }) {
  const [preset, setPreset] = useState('24h');
  const [custom, setCustom] = useState({ from: toLocalInput(new Date(Date.now() - 86400e3)), to: toLocalInput(new Date()) });
  const [type, setType] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [page, setPage] = useState(1);
  const range = useMemo(() => {
    if (preset === 'custom') return { from: new Date(custom.from).toISOString(), to: new Date(custom.to).toISOString() };
    const ms = PRESETS.find(p => p[0] === preset)[2];
    return { from: new Date(Date.now() - ms).toISOString(), to: new Date(Date.now() + 60e3).toISOString() };
  }, [preset, custom, live.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const devices = useLoad(() => (house ? api('/devices', { query: { houseId: house.id, pageSize: 100, includeArchived: 'true' } }).then(r => r.items) : Promise.resolve([])), [house?.id]);
  const events = useLoad(() => (house ? api('/data/events', { query: { houseId: house.id, ...range, type: type || undefined, deviceId: deviceId || undefined, page, pageSize: 25 } }) : Promise.resolve(null)), [house?.id, range, type, deviceId, page]);

  if (!house) return <div className="panel"><Empty title="Choose a house to explore its data">Use the House menu at the top. History queries are always scoped to one house and a bounded time window (at most 31 days).</Empty></div>;
  const cols = ['id', 'occurredAt', 'type', 'deviceName', 'source', 'confidence', 'processingState', 'correlationId'];
  return (
    <section className="panel" aria-labelledby="hist-h">
      <header className="panel-head"><h2 id="hist-h">Events at {house.name}</h2>
        <button className="btn btn-sm" disabled={!events.data?.items.length} onClick={() => download(`${house.id}-events-page${page}.csv`, toCsv(events.data.items, cols))}>Export this page as CSV</button></header>
      <div className="filters">
        <label className="sr-only" htmlFor="rng">Time range</label>
        <select id="rng" value={preset} onChange={e => { setPreset(e.target.value); setPage(1); }}>{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        {preset === 'custom' && <>
          <Field label="From" className="inline">{p => <input {...p} type="datetime-local" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} />}</Field>
          <Field label="To" className="inline">{p => <input {...p} type="datetime-local" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} />}</Field>
        </>}
        <label className="sr-only" htmlFor="ety">Event type</label>
        <select id="ety" value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="">All event types</option>{TYPES.map(t => <option key={t} value={t}>{human(t)}</option>)}</select>
        <label className="sr-only" htmlFor="edv">Device</label>
        <select id="edv" value={deviceId} onChange={e => { setDeviceId(e.target.value); setPage(1); }}><option value="">All devices</option>{(devices.data || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      </div>
      {events.error && <ErrorBox error={events.error} onRetry={events.reload} />}
      {events.loading ? <Skeleton rows={5} label="Querying events" /> : events.data && (events.data.items.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Event</th><th>Device</th><th>Source</th><th>Confidence</th><th>Storage</th></tr></thead>
              <tbody>{events.data.items.map(e => (
                <tr key={e.id}>
                  <td>{when(e.occurredAt, house.timezone)}</td>
                  <td><a className="link" href={`#data/${encodeURIComponent(e.id)}`}>{human(e.type)}</a></td>
                  <td>{e.deviceName}</td>
                  <td>{sourceLabel(e.source)}</td>
                  <td>{pct(e.confidence)}</td>
                  <td><Status value={e.processingState} /></td>
                </tr>))}</tbody>
            </table>
          </div>
          <nav className="pager" aria-label="Event pages">
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page}</span>
            <button className="btn btn-sm" disabled={!events.data.hasMore} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        </>
      ) : <Empty title="No events in this window">Try a longer time range, or send a simulated event.</Empty>)}
    </section>
  );
}

function Reconcile() {
  const { live } = useApp();
  const toast = useToast();
  const list = useLoad(() => api('/data/reconciliation').then(r => r.items), [live.version]);
  const [ask, setAsk] = useState(false);
  const run = useSubmit(async retryQuarantined => {
    const r = await api('/data/reconcile', { method: 'POST', body: { correlationId: newId(), limit: 25, retryQuarantined } });
    setAsk(false); toast(`${r.processed} record${r.processed === 1 ? '' : 's'} processed.`); list.reload();
  });
  const items = list.data || [];
  return (
    <section className="panel" aria-labelledby="rc-h">
      <header className="panel-head"><div><h2 id="rc-h">Incomplete cross-store writes</h2>
        <p className="muted">Events accepted in PostgreSQL whose MongoDB detail isn't stored yet. Retries reuse the same event ID, so they never create a second record or alert.</p></div>
        <div className="row"><button className="btn btn-primary" disabled={run.busy} onClick={() => run.run(false)}>Retry pending</button>
          <button className="btn" disabled={run.busy || !items.some(i => i.processingState === 'QUARANTINED')} onClick={() => setAsk(true)}>Retry quarantined</button></div></header>
      <FormError error={run.error} />
      {list.loading ? <Skeleton rows={3} /> : items.length ? (
        <table className="compact"><thead><tr><th>Event</th><th>State</th><th>Attempts</th><th>Last problem</th><th>Next try</th></tr></thead>
          <tbody>{items.map(e => <tr key={e.id}><td><a className="link" href={`#data/${encodeURIComponent(e.id)}`}>{human(e.type)}</a><small className="sub mono">{e.id}</small></td><td><Status value={e.processingState} /></td><td>{e.attempts} of 5</td><td>{e.lastError ? human(e.lastError) : 'None'}</td><td>{e.processingState === 'QUARANTINED' ? 'Needs operator' : ago(e.nextAttemptAt)}</td></tr>)}</tbody></table>
      ) : <Empty title="Everything is consistent">Both stores agree for every accepted event.</Empty>}
      {ask && <Confirm title="Retry quarantined records?" action="Retry quarantined" busy={run.busy} onClose={() => setAsk(false)} onConfirm={() => run.run(true)}>
        <p>Do this after MongoDB is available again. Each record gets five new attempts.</p></Confirm>}
    </section>
  );
}

function Audit() {
  const { live } = useApp();
  const [page, setPage] = useState(1);
  const list = useLoad(() => api('/audit', { query: { page, pageSize: 25 } }), [page, live.version]);
  return (
    <section className="panel" aria-labelledby="au-h">
      <header className="panel-head"><h2 id="au-h">Audit log</h2><span className="muted">Append-only record of sign-ins, changes and alert actions</span></header>
      {list.loading ? <Skeleton rows={5} /> : !list.data ? <ErrorBox error={list.error} onRetry={list.reload} /> : (
        <>
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Action</th><th>Who</th><th>Target</th><th>House</th></tr></thead>
            <tbody>{list.data.items.map(a => <tr key={a.id}><td>{when(a.createdAt)}</td><td>{human(a.action)}</td><td>{a.actorEmail || (a.actor.includes('worker') ? 'System' : a.actor)}</td><td className="mono">{a.target}</td><td>{a.houseName || ''}</td></tr>)}</tbody>
          </table></div>
          <nav className="pager"><button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button className="btn btn-sm" disabled={!list.data.hasMore} onClick={() => setPage(page + 1)}>Next</button></nav>
        </>
      )}
    </section>
  );
}
