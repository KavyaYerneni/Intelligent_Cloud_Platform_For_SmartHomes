import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { human, pct, when } from '../../lib/format';
import Status from '../../ui/Status';
import { Drawer } from '../../ui/Overlay';
import { ErrorBox, Skeleton } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { sourceLabel } from '../../lib/source';
import { Bar } from '../ai/Bar';

/** One event across both stores: the PostgreSQL reference and the MongoDB detail. */
export default function EventDrawer({ id, onClose }) {
  const { go, live } = useApp();
  const e = useLoad(() => api(`/events/${id}`), [id, live.version]);
  const [raw, setRaw] = useState(false);
  if (e.loading) return <Drawer title="Event" onClose={onClose}><Skeleton rows={6} /></Drawer>;
  if (!e.data) return <Drawer title="Event" onClose={onClose}><ErrorBox error={e.error} onRetry={e.reload} /></Drawer>;
  const x = e.data;
  const simulated = x.aiResult?.inference === 'SIMULATED_OR_RULE_BASED' || x.source === 'simulator';
  return (
    <Drawer title={human(x.type)} subtitle={`${x.deviceName} at ${x.houseName}`} onClose={onClose} actions={<Status value={x.processingState} />}>
      <section className="drawer-section">
        <h3>What happened</h3>
        <dl className="facts">
          <dt>Occurred</dt><dd>{when(x.occurredAt, x.timezone)}</dd>
          <dt>Source</dt><dd>{x.source === 'simulator' ? 'Simulator (synthetic)' : sourceLabel(x.source)}</dd>
          <dt>Confidence</dt><dd>{pct(x.confidence)}</dd>
          <dt>Alert</dt><dd>{x.alertId ? <button className="link" onClick={() => go('alerts', x.alertId)}>Open the alert this event belongs to</button> : 'No alert (below threshold or routine)'}</dd>
        </dl>
      </section>
      <section className="drawer-section">
        <h3>Storage</h3>
        <ol className="store-steps">
          <li className="done"><strong>PostgreSQL reference</strong><small>Accepted and claimed by event ID {x.id}</small></li>
          <li className={x.detail ? 'done' : 'wait'}><strong>MongoDB detail</strong><small>{x.detail ? 'Stored in telemetry_events' : x.processingState === 'QUARANTINED' ? 'Not stored; quarantined after repeated failures' : 'Not stored yet; the worker will retry'}</small></li>
          <li className={x.processingState === 'CONSISTENT' ? 'done' : 'wait'}><strong>Consistent</strong><small>{x.processingState === 'CONSISTENT' ? 'Both stores agree' : `${x.attempts} attempt${x.attempts === 1 ? '' : 's'}${x.lastError ? `, last problem: ${human(x.lastError)}` : ''}`}</small></li>
        </ol>
      </section>
      <section className="drawer-section">
        <h3>Classification</h3>
        {x.aiResult && x.source === 'model' ? <ModelResult r={x.aiResult} /> : x.aiResult ? (
          <dl className="facts">
            <dt>Label</dt><dd>{human(x.aiResult.label)}</dd>
            <dt>Decided by</dt><dd>{x.aiResult.model === 'deterministic-rules' ? 'Deterministic safety rule' : `${x.aiResult.model} ${x.aiResult.modelVersion}`}</dd>
            <dt>Inference</dt><dd>{simulated ? 'Simulated or rule based. No trained model is used.' : human(x.aiResult.inference)}</dd>
          </dl>
        ) : <p className="muted">No classification record (routine telemetry, or not processed yet).</p>}
      </section>
      <section className="drawer-section">
        <h3>Identifiers</h3>
        <dl className="facts">
          <dt>Event ID</dt><dd className="mono">{x.id}</dd>
          <dt>Correlation ID</dt><dd className="mono">{x.correlationId}</dd>
        </dl>
        <button className="btn btn-sm" aria-expanded={raw} onClick={() => setRaw(!raw)}>{raw ? 'Hide raw record' : 'Show raw record'}</button>
        {raw && <pre className="raw">{JSON.stringify({ reference: { ...x, detail: undefined, aiResult: undefined }, mongoDetail: x.detail, aiResult: x.aiResult }, null, 2)}</pre>}
      </section>
    </Drawer>
  );
}

/** Classification by the trained model: what it heard, how sure, and with which exact model file. */
function ModelResult({ r }) {
  return (
    <>
      {r.inference === 'TEST_EMBEDDER' && <p className="banner banner-bad">Classified with the test embedder: not a real prediction.</p>}
      <dl className="facts">
        <dt>Model heard</dt><dd><strong>{r.label}</strong>, {Math.round(r.confidence * 100)}% confident</dd>
        <dt>Became</dt><dd>{human(r.eventType)}</dd>
        <dt>Decided by</dt><dd>Trained model {r.model} {r.modelVersion} on {r.backbone} embeddings{r.latencyMs != null ? `, ${Math.round(r.latencyMs)} ms` : ''}</dd>
        <dt>Model file</dt><dd className="mono">SHA-256 {String(r.modelSha256).slice(0, 16)}…</dd>
        {r.audio && <><dt>Clip</dt><dd>{r.audio.durationSeconds} s at {r.audio.sampleRate} Hz</dd></>}
      </dl>
      {r.probabilities?.length > 0 && (
        <ul className="label-bars">
          {r.probabilities.map(p => (
            <li key={p.label}><span className="lb-name">{p.label}</span><Bar value={p.probability} label={`${Math.round(p.probability * 100)}%`} tone={p.label === r.label ? 'ok' : 'muted'} /><span className="lb-meta">{(p.probability * 100).toFixed(1)}%</span></li>
          ))}
        </ul>
      )}
    </>
  );
}
