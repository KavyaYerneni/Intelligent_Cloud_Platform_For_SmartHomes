import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, when } from '../../lib/format';
import { can } from '../../lib/roles';
import Status from '../../ui/Status';
import { Confirm } from '../../ui/Overlay';
import { FormError, useSubmit } from '../../ui/Form';
import { Empty, ErrorBox, Skeleton, Tabs, useToast } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { ruleText } from '../simulator/preview';
import TryModel from './TryModel';
import { Bar } from './Bar';

// Model management for the AI component (rubric: UI, model management, deployment).
// Data comes from GET /ai/models and /ai/stats; actions are operator-only on the server.
export default function AiModels({ arg }) {
  const { user, live } = useApp();
  const [tab, setTab] = useState(arg || 'monitor');
  const models = useLoad(() => api('/ai/models', { query: { fresh: 'true' } }), []);
  const stats = useLoad(() => api('/ai/stats', { query: { hours: 24 } }), [live.version]);
  if (models.loading) return <Skeleton rows={6} label="Loading AI models" />;
  if (!models.data) return <ErrorBox error={models.error} onRetry={models.reload} />;
  const m = models.data;
  const model = m.models.find(x => x.version === m.active.version) || m.models[0];
  const s = stats.data;
  const testOnly = m.service.embedder?.testOnly;

  return (
    <>
      {!m.service.reachable && (
        <p className="banner banner-bad" role="alert">
          <strong>The inference service isn't reachable.</strong> {m.service.error} Live audio is refused until it's back; devices keep their clips and retry with the same event ID.
        </p>
      )}
      {testOnly && (
        <p className="banner banner-bad" role="alert">
          <strong>Test embedder active.</strong> The service is running without YAMNet, so predictions are meaningless. Start it normally (EMBEDDER=yamnet, the default) for real inference.
        </p>
      )}
      {m.service.reachable && m.service.embedder && !m.service.embedder.loaded && (
        <p className="banner banner-bad" role="alert"><strong>YAMNet failed to load.</strong> {m.service.embedder.error}</p>
      )}

      <p className="banner banner-info">Human recordings use the team’s ten-class model. General sound playback uses YAMNet AudioSet predictions for animals, appliances, and other sounds. Scores describe model confidence; they are not accuracy measurements. Both paths follow the community’s enable/disable setting.</p>
      <dl className="strip">
        <div><dt>Inference service</dt><dd><Status value={!m.service.reachable ? 'UNAVAILABLE' : testOnly ? 'DEGRADED' : 'HEALTHY'} label={!m.service.reachable ? 'Unreachable' : testOnly ? 'Test mode' : 'Ready'} /></dd><small>{m.service.embedder ? `Backbone: ${m.service.embedder.kind === 'yamnet' ? 'YAMNet' : 'test embedder'}` : 'No backbone loaded'}</small></div>
        <div><dt>Live model</dt><dd className="model-name">{model ? `${model.name} ${model.version}` : 'None loaded'}</dd><small><Status value={m.active.enabled ? 'ONLINE' : 'ARCHIVED'} label={m.active.enabled ? 'Enabled' : 'Disabled'} quiet /></small></div>
        <div><dt>Clips classified, 24 h</dt><dd>{s?.byStatus.OK ?? 0}</dd><small>{s ? `${s.byStatus.FAILED ?? 0} failed, ${s.byStatus.REJECTED ?? 0} rejected` : ''}</small></div>
        <div><dt>Alerts raised by the model</dt><dd className={s?.alertsFromModel ? 'bad' : ''}>{s?.alertsFromModel ?? 0}</dd><small>Last 24 hours</small></div>
        <div><dt>Latency</dt><dd>{s?.latencyMs.p50 != null ? `${Math.round(s.latencyMs.p50)} ms` : '-'}</dd><small>{s?.latencyMs.p95 != null ? `p95 ${Math.round(s.latencyMs.p95)} ms` : 'Median per clip'}</small></div>
      </dl>

      <Tabs value={tab} onChange={setTab} tabs={[['monitor', 'Live monitoring'], ['card', 'Model card'], ['try', 'Try the model'], ['mapping', 'Label to alert mapping']]} />
      {tab === 'monitor' && <Monitor stats={stats} />}
      {tab === 'card' && <ModelCard data={m} model={model} canManage={can(user, 'aiManage')} onChanged={models.reload} />}
      {tab === 'try' && <TryModel model={model} serviceReady={m.service.reachable} />}
      {tab === 'mapping' && <Mapping labelMap={m.labelMap} />}
    </>
  );
}

function Monitor({ stats }) {
  if (stats.loading) return <Skeleton rows={5} />;
  if (!stats.data) return <ErrorBox error={stats.error} onRetry={stats.reload} />;
  const s = stats.data;
  const max = Math.max(1, ...s.byLabel.map(x => x.count));
  return (
    <div className="grid-two">
      <section className="panel" aria-labelledby="heard-h">
        <header className="panel-head"><h2 id="heard-h">What the model heard</h2><span className="muted">Last 24 hours, monitoring events</span></header>
        {s.byLabel.length ? (
          <ul className="label-bars">
            {s.byLabel.map(x => (
              <li key={x.label}>
                <span className="lb-name">{x.label}</span>
                <Bar value={x.count / max} label={`${x.count} clip${x.count === 1 ? '' : 's'}`} tone={x.eventType === 'normal_activity_sound' ? 'muted' : 'warn'} />
                <span className="lb-meta">{x.count}, avg {Math.round(x.avgConfidence * 100)}%</span>
              </li>
            ))}
          </ul>
        ) : <Empty title="No live clips yet">Send a recorded clip from the Simulator, or run the audio agent against your dataset folder.</Empty>}
      </section>
      <section className="panel" aria-labelledby="recent-h">
        <header className="panel-head"><h2 id="recent-h">Recent inferences</h2></header>
        {s.recent.length ? (
          <div className="table-wrap"><table className="compact">
            <thead><tr><th>When</th><th>Where</th><th>Model heard</th><th>Result</th></tr></thead>
            <tbody>{s.recent.map(r => (
              <tr key={r.id}>
                <td title={when(r.createdAt)}>{ago(r.createdAt)}</td>
                <td>{r.deviceName ? <>{r.deviceName}<small className="sub">{r.houseName}</small></> : <span className="muted">Test console</span>}</td>
                <td>{r.label ? <>{r.label}<small className="sub">{Math.round(r.confidence * 100)}% confidence</small></> : <span className="muted">{human(r.errorCode)}</span>}</td>
                <td>{r.eventId ? <a className="link" href={`#data/${encodeURIComponent(r.eventId)}`}>{human(r.eventType)}</a> : <Status value={r.status === 'TEST' ? 'INFO' : r.status} label={r.status === 'TEST' ? 'Test only' : human(r.status)} />}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="muted">Nothing yet.</p>}
      </section>
    </div>
  );
}

function ModelCard({ data, model, canManage, onChanged }) {
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const change = useSubmit(async (body) => {
    await api(`/ai/models/${encodeURIComponent(data.active.name)}/settings`, { method: 'PUT', body });
    setAsk(false); toast(body.enabled ? 'Audio inference enabled.' : 'Audio inference disabled.'); onChanged();
  });
  if (!model) return <div className="panel"><Empty title="No model registered">The inference service reported no models. Check ml/models and the service logs.</Empty></div>;
  const r = model.reportedMetrics;
  const e = model.evaluation;
  return (
    <div className="grid-model">
      <section className="panel" aria-labelledby="card-h">
        <header className="panel-head">
          <div><h2 id="card-h">{model.displayName}</h2><p className="muted">{model.name} version {model.version}</p></div>
          <div className="row wrap">
            <Status value={model.loaded ? 'ONLINE' : 'FAILED'} label={model.loaded ? 'Loaded' : 'Not loaded'} />
            <Status value={model.sha256Verified ? 'CONSISTENT' : 'FAILED'} label={model.sha256Verified ? 'Checksum verified' : 'Checksum mismatch'} />
          </div>
        </header>
        <p>{model.description}</p>
        {model.loadError && <p className="banner banner-bad">{model.loadError}</p>}
        <dl className="facts">
          <dt>Architecture</dt><dd>{model.architecture}</dd>
          <dt>Backbone</dt><dd>{model.backbone.name} ({model.backbone.publisher}). {model.backbone.use}</dd>
          <dt>Input</dt><dd>{model.input.format}, resampled to {model.input.sampleRate / 1000} kHz mono, {model.input.minSeconds} to {model.input.maxSeconds} s</dd>
          <dt>Framework</dt><dd>{model.framework}</dd>
          <dt>Training data</dt><dd>{model.training.data}</dd>
          <dt>Split</dt><dd>{model.training.split}; {model.training.epochs} epochs, {model.training.optimizer}</dd>
          <dt>Source</dt><dd>{model.training.source}</dd>
          <dt>SHA-256</dt><dd className="mono">{model.sha256}</dd>
          <dt>Classes</dt><dd className="chips">{model.classes.map(c => <span key={c} className="chip chip-static">{c}</span>)}</dd>
        </dl>
        <div className="action-box">
          <p><strong>Live audio inference is {data.active.enabled ? 'enabled' : 'disabled'}</strong> for your community{data.active.updatedAt ? `, changed ${ago(data.active.updatedAt)}` : ''}.
            {data.active.enabled ? ' Microphone clips are classified and can raise alerts.' : ' Microphone clips are refused with "model disabled".'}</p>
          {canManage
            ? <button className={`btn ${data.active.enabled ? 'btn-danger-outline' : 'btn-primary'}`} onClick={() => { change.setError(undefined); setAsk(true); }}>{data.active.enabled ? 'Disable audio inference' : 'Enable audio inference'}</button>
            : <p className="hint">Only a cloud operator can enable or disable the model.</p>}
        </div>
        {ask && (
          <Confirm title={data.active.enabled ? 'Disable audio inference?' : 'Enable audio inference?'} danger={data.active.enabled}
            action={data.active.enabled ? 'Disable' : 'Enable'} busy={change.busy} onClose={() => setAsk(false)}
            onConfirm={() => change.run({ enabled: !data.active.enabled, version: model.version })}>
            <p>{data.active.enabled ? 'Microphones in your community stop producing AI events and alerts until it is enabled again. Other communities are not affected.' : `Microphone clips will be classified by ${model.name} ${model.version}.`}</p>
            <FormError error={change.error} />
          </Confirm>
        )}
      </section>

      <section className="panel" aria-labelledby="metrics-h">
        <header className="panel-head"><h2 id="metrics-h">How well it works</h2></header>
        <h3>Measured with evaluate.py</h3>
        {e ? (
          <>
            <p><strong>{Math.round(e.accuracy * 100)}% accuracy</strong> on {e.recordings} recordings{e.excludedTrainingRecordings ? ' not used in training' : ''}, {when(e.evaluatedAt)}. Dataset: {e.dataset}.</p>
            <MetricsTable perClass={e.perClass} />
          </>
        ) : (
          <div className="banner banner-muted">
            <span>No measured evaluation yet. On the computer with the dataset, run:<br />
              <code>python ml/evaluate.py --audio-dir &lt;folder&gt; --labels &lt;labels.xlsx&gt; --exclude ml/training-recordings.txt</code><br />
              then restart the inference service. Excluding the training recordings gives an honest held-out score.</span>
          </div>
        )}
        <h3>Reported by the training notebook</h3>
        <p>{Math.round(r.accuracy * 100)}% accuracy on {r.testRows} test rows; macro F1 {r.macro.f1}.</p>
        <p className="banner banner-warn">{r.caveat}</p>
        <MetricsTable perClass={r.perClass} />
      </section>
    </div>
  );
}

function MetricsTable({ perClass }) {
  return (
    <div className="table-wrap"><table className="compact">
      <thead><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th><th>Clips</th></tr></thead>
      <tbody>{Object.entries(perClass).map(([c, v]) => (
        <tr key={c} className={v.f1 < 0.8 ? 'row-weak' : ''}>
          <td>{c}</td><td>{v.precision.toFixed(2)}</td><td>{v.recall.toFixed(2)}</td><td>{v.f1.toFixed(2)}{v.f1 < 0.8 && <small className="sub">Weak</small>}</td><td>{v.support}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

function Mapping({ labelMap }) {
  return (
    <section className="panel" aria-labelledby="map-h">
      <header className="panel-head"><div><h2 id="map-h">From what the model hears to an alert</h2>
        <p className="muted">The model only names the sound. The platform turns the name into an event type, and the alert rules decide, using the model's confidence, whether an alert is raised.</p></div></header>
      <div className="table-wrap"><table>
        <thead><tr><th>Model label</th><th>Event type</th><th>Alert rule</th><th>Why</th></tr></thead>
        <tbody>{labelMap.map(x => (
          <tr key={x.label}>
            <td><strong>{x.label}</strong></td>
            <td>{human(x.eventType)}</td>
            <td>{x.rule?.severity ? <Status value={x.rule.severity} label={ruleText(x.rule)} /> : <span className="muted">{ruleText(x.rule)}</span>}</td>
            <td className="muted">{x.why}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}
