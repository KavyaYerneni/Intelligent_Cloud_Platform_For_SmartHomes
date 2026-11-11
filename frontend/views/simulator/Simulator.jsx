import React, { useEffect, useRef, useState } from 'react';
import { api, newId } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, clock, human } from '../../lib/format';
import Status from '../../ui/Status';
import Icon from '../../ui/Icon';
import { Empty, ErrorBox, Skeleton } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { preview, ruleText } from './preview';

const HEARTBEAT_EVERY = 10;

export default function Simulator() {
  const { house, houses, live, go } = useApp();
  const h = houses.find(x => x.id === house);
  const catalog = useLoad(() => api('/catalog'), []);
  const devices = useLoad(() => (house ? api('/devices', { query: { houseId: house, pageSize: 100 } }).then(r => r.items) : Promise.resolve([])), [house, live.version]);
  const [deviceId, setDeviceId] = useState('');
  const [log, setLog] = useState([]);
  const [auto, setAuto] = useState(false);
  const [tick, setTick] = useState(HEARTBEAT_EVERY);
  const [type, setType] = useState('smoke_alarm');
  const [confidence, setConfidence] = useState(0.94);
  const last = useRef(null);
  const d = devices.data?.find(x => x.id === deviceId);

  useEffect(() => { if (devices.data && !devices.data.some(x => x.id === deviceId)) setDeviceId(devices.data[0]?.id || ''); }, [devices.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setAuto(false); }, [deviceId]);

  const [clips, setClips] = useState([]);
  const [classifier, setClassifier] = useState('human');
  const [sending, setSending] = useState(false);
  // Each clip gets its own event ID; the server classifies it with the trained model.
  const sendClips = async () => {
    setSending(true);
    for (const f of clips) {
      try {
        const r = await api(`/devices/${deviceId}/audio`, { method: 'POST', audio: f, headers: { 'X-Event-Id': `aud-${newId()}`, 'X-Audio-Classifier': classifier, 'X-Audio-Origin': 'recorded-dataset' } });
        const i = r.inference;
        note(`AI: ${f.name}`, true, `${i.testEmbedder ? '[Test embedder, not real] ' : ''}Model heard ${i.label} (${Math.round(i.confidence * 100)}%), stored as ${human(i.eventType).toLowerCase()}${r.alertPreview ? `; a ${r.alertPreview.toLowerCase()} alert will be raised.` : '; no alert.'}`);
      } catch (e) { note(`AI: ${f.name}`, false, e.message); }
    }
    setSending(false);
    devices.reload();
  };
  const note = (action, ok, detail) => setLog(l => [{ id: newId(), at: new Date(), action, ok, detail }, ...l].slice(0, 30));
  const heartbeat = async () => {
    try {
      const fresh = await api(`/devices/${deviceId}`);
      const r = await api(`/devices/${deviceId}/heartbeat`, { method: 'POST', body: { timestamp: new Date().toISOString(), firmware: 'simulator-1.0', reportedVersion: fresh.configVersion, metrics: { signalDbm: -45, battery: 98 } } });
      note('Heartbeat', true, `Device is ${human(r.status).toLowerCase()}. Reported configuration version ${r.reportedVersion}.`);
      devices.reload();
    } catch (e) { note('Heartbeat', false, e.message); setAuto(false); }
  };
  useEffect(() => {
    if (!auto) return;
    setTick(HEARTBEAT_EVERY);
    const t = setInterval(() => setTick(s => { if (s <= 1) { heartbeat(); return HEARTBEAT_EVERY; } return s - 1; }), 1000);
    return () => clearInterval(t);
  }, [auto, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ackCommands = async () => {
    try {
      const { items } = await api(`/devices/${deviceId}/commands`);
      const open = items.filter(c => ['QUEUED', 'SENT'].includes(c.state));
      for (const c of open) await api(`/devices/${deviceId}/commands/${c.id}/ack`, { method: 'POST', body: { state: 'ACKED' } });
      note('Commands', true, open.length ? `Acknowledged ${open.length} queued command${open.length > 1 ? 's' : ''} (simulated execution).` : 'No queued commands.');
    } catch (e) { note('Commands', false, e.message); }
  };
  const emit = async replay => {
    const body = replay ? last.current : {
      schemaVersion: '1.0', eventId: `evt-${newId()}`, correlationId: `corr-${newId().slice(0, 12)}`, houseId: house, deviceId, type,
      occurredAt: new Date().toISOString(), source: 'simulator', confidence: type === 'smoke_alarm' || type === 'telemetry' ? null : Number(confidence), modelVersion: 'v1',
      payload: type === 'telemetry' ? { temperatureC: 21.4 } : { durationMs: 1860, synthetic: true },
    };
    last.current = body;
    try {
      const r = await api(body.type === 'telemetry' ? '/data/telemetry' : '/events', { method: 'POST', body, key: body.eventId });
      note(replay ? 'Replay' : `${human(body.type)} event`, true, replay
        ? `Same event ID and content: the server returned the original result (${human(r.processingState).toLowerCase()}). No second record or alert.`
        : `Accepted as ${r.eventId.slice(0, 18)}… The worker stores it and applies the alert rule within a second or two.`);
    } catch (e) { note(replay ? 'Replay' : 'Event', false, e.message); }
  };

  if (!h) return <div className="panel"><Empty title="Choose a house to simulate">Use the House menu at the top, then pick one of its devices.</Empty></div>;
  if (catalog.loading || devices.loading) return <Skeleton rows={6} label="Loading simulator" />;
  if (catalog.error) return <ErrorBox error={catalog.error} onRetry={catalog.reload} />;
  // Model-only event types are produced by the trained model, not composed by hand.
  const rules = catalog.data.alertRules.filter(r => r.model !== 'trained-model');
  const rule = rules.find(r => r.type === type);
  const outcome = preview(rule, Number(confidence));

  return (
    <>
      <p className="banner banner-muted">Devices here are simulated and stand in for AWS IoT Core. Events you compose are synthetic and decided by rules; recorded clips you send are classified by the real trained model.</p>
      <div className="grid-sim">
        <section className="panel" aria-labelledby="sd-h">
          <header className="panel-head"><h2 id="sd-h">Device</h2></header>
          {!devices.data.length ? <Empty title={`${h.name} has no devices`}><button className="btn btn-sm" onClick={() => go('inventory')}>Register a device</button></Empty> : <>
            <label className="sr-only" htmlFor="sim-dev">Device</label>
            <select id="sim-dev" value={deviceId} onChange={e => setDeviceId(e.target.value)}>{devices.data.map(x => <option key={x.id} value={x.id}>{x.name} ({x.roomName})</option>)}</select>
            {d && <div className="sim-device">
              <Status value={d.status} />
              <p>Last heartbeat {ago(d.lastSeen)}. Configuration v{d.reportedVersion} applied{d.reportedVersion < d.configVersion ? `, v${d.configVersion} waiting` : ''}.</p>
            </div>}
            <div className="stack">
              <button className="btn btn-primary" onClick={heartbeat} disabled={!d}>Send one heartbeat</button>
              <button className={`btn ${auto ? 'btn-on' : ''}`} aria-pressed={auto} onClick={() => { if (!auto) heartbeat(); setAuto(!auto); }} disabled={!d}>
                {auto ? `Heartbeats on, next in ${tick} s` : `Send heartbeats every ${HEARTBEAT_EVERY} s`}
              </button>
              <button className="btn" onClick={ackCommands} disabled={!d}>Acknowledge queued commands</button>
            </div>
            <p className="hint">Stop heartbeats to watch the device go offline after {catalog.data.heartbeatSeconds} seconds, then start them again to recover.</p>
          </>}
        </section>

        <section className="panel" aria-labelledby="se-h">
          <header className="panel-head"><h2 id="se-h">Event</h2></header>
          <fieldset className="type-cards">
            <legend className="sr-only">Event type</legend>
            {rules.map(r => (
              <label key={r.type} className={`type-card ${type === r.type ? 'on' : ''}`}>
                <input type="radio" name="etype" value={r.type} checked={type === r.type} onChange={() => setType(r.type)} />
                <strong>{human(r.type)}</strong><small>{ruleText(r)}</small>
              </label>
            ))}
          </fieldset>
          {rule?.rule === 'confidence' || type === 'normal_appliance_sound' ? (
            <div className="field">
              <label htmlFor="conf">Simulated confidence <output>{Number(confidence).toFixed(2)}</output></label>
              <input id="conf" type="range" min="0" max="1" step="0.01" value={confidence} onChange={e => setConfidence(e.target.value)} />
            </div>
          ) : <p className="hint">{type === 'smoke_alarm' ? 'Smoke alarms use a deterministic safety rule, so no confidence is sent.' : 'Telemetry carries readings, not a classification.'}</p>}
          <div className={`outcome ${outcome.severity ? 'outcome-alert' : ''}`} role="status" aria-live="polite">
            {outcome.severity ? <Status value={outcome.severity} /> : <Status value="INFO" label="No alert" />}
            <span>{outcome.text}</span>
          </div>
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => emit(false)} disabled={!d}>Send event</button>
            <button className="btn" onClick={() => emit(true)} disabled={!last.current}>Replay last event</button>
          </div>
          <div className="audio-send">
            <h3>Recorded audio, classified by the trained AI model</h3>
            <label className="field">Sound classifier<select value={classifier} onChange={e => setClassifier(e.target.value)}><option value="human">Human sounds · team classifier</option><option value="general">Appliances, animals & general sounds · YAMNet</option></select></label>
            <p className="hint">Choose WAV clips, for example from your dataset. Each one is sent as this device's microphone capture; the model decides what it heard, and the alert rules decide what happens next.</p>
            <label className={`dropzone dropzone-sm ${clips.length ? 'has-file' : ''}`}>
              <Icon name="upload" size={18} />
              <span>{clips.length ? `${clips.length} clip${clips.length > 1 ? 's' : ''}: ${clips.map(f => f.name).slice(0, 3).join(', ')}${clips.length > 3 ? '…' : ''}` : 'Choose WAV clips'}</span>
              <input type="file" multiple accept=".wav,audio/wav,audio/x-wav" onChange={e => setClips([...e.target.files])} />
            </label>
            {d && !(d.capabilities || []).includes('audio')
              ? <p className="hint">This device has no audio capability. Choose a microphone.</p>
              : <button className="btn btn-primary" onClick={sendClips} disabled={!d || !clips.length || sending}>{sending ? 'Classifying' : `Send ${clips.length > 1 ? `${clips.length} clips` : 'clip'} to the model`}</button>}
          </div>
        </section>

        <section className="panel sim-log" aria-labelledby="sl-h">
          <header className="panel-head"><h2 id="sl-h">What happened</h2>{log.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setLog([])}>Clear</button>}</header>
          {log.length ? <ol className="log">{log.map(l => (
            <li key={l.id} className={l.ok ? '' : 'log-bad'}><span className="log-time">{clock(l.at)}</span><strong>{l.action}</strong><span>{l.detail}</span></li>
          ))}</ol> : <p className="muted">Results of each action appear here.</p>}
          <div className="row wrap"><button className="btn btn-sm" onClick={() => go('alerts')}>Go to alerts</button><button className="btn btn-sm" onClick={() => go('overview')}>Go to overview</button></div>
        </section>
      </div>
    </>
  );
}
