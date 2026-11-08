import React, { useState } from 'react';
import { api, newId } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, when } from '../../lib/format';
import { can } from '../../lib/roles';
import Status from '../../ui/Status';
import Icon from '../../ui/Icon';
import { Confirm, Dialog, Drawer } from '../../ui/Overlay';
import { Field, FormError, useSubmit } from '../../ui/Form';
import { ErrorBox, Skeleton, Tabs, useToast } from '../../ui/Feedback';
import { useApp } from '../../app/context';

export default function DeviceDrawer({ id, catalog, rooms, onClose, onChanged }) {
  const { user, live } = useApp();
  const toast = useToast();
  const dev = useLoad(() => api(`/devices/${id}`), [id, live.version]);
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(null);
  const manage = can(user, 'manageInventory');
  if (dev.loading) return <Drawer title="Device" onClose={onClose}><Skeleton rows={6} /></Drawer>;
  if (!dev.data) return <Drawer title="Device" onClose={onClose}><ErrorBox error={dev.error} onRetry={dev.reload} /></Drawer>;
  const d = dev.data;
  const archived = d.status === 'ARCHIVED';
  const done = async msg => { setDialog(null); toast(msg); await dev.reload(); onChanged(); };
  const behind = d.reportedVersion < d.configVersion;

  return (
    <Drawer title={d.name} subtitle={`${human(d.type)} in ${d.roomName}, ${d.houseName}`} onClose={onClose} actions={<Status value={d.status} />}>
      {archived && <p className="banner banner-muted">Archived. History stays available; the device can't connect or receive commands.</p>}
      <Tabs value={tab} onChange={setTab} tabs={[['overview', 'Overview'], ['config', 'Configuration', d.configurations.length], ['commands', 'Commands', d.commands.length], ...(manage ? [['access', 'Access']] : [])]} />

      {tab === 'overview' && (
        <div className="tab-body">
          <dl className="facts">
            <dt>Last heartbeat</dt><dd>{ago(d.lastSeen)}<small>{when(d.lastSeen, d.timezone)}</small></dd>
            <dt>Serial number</dt><dd>{d.serialNo}</dd>
            <dt>Firmware</dt><dd>{d.firmwareVersion || 'Not reported'}</dd>
            <dt>Configuration</dt><dd>{d.reportedVersion ? `Version ${d.reportedVersion} applied` : 'Default (no version published)'}{behind && <small>Version {d.configVersion} waiting for the device</small>}</dd>
            <dt>Capabilities</dt><dd className="chips">{(d.capabilities || []).map(c => <span key={c} className="chip chip-static">{human(c)}</span>)}</dd>
            <dt>Device ID</dt><dd className="mono">{d.id}</dd>
          </dl>
          {d.status === 'REGISTERED' && <p className="banner banner-warn">Waiting for the first heartbeat. Use the simulator, or issue a credential for a real device.</p>}
          {manage && !archived && (
            <div className="row wrap">
              <button className="btn" onClick={() => setDialog('edit')}>Rename or move</button>
              <button className="btn btn-danger-outline" onClick={() => setDialog('archive')}>Archive device</button>
            </div>
          )}
        </div>
      )}

      {tab === 'config' && (
        <div className="tab-body">
          <p className="muted">Each change creates a new version. It shows as applied once the device reports it in a heartbeat.</p>
          {manage && !archived && <button className="btn btn-primary" onClick={() => setDialog('config')}>Publish version {d.configVersion + 1}</button>}
          <ol className="versions">
            {d.configurations.map(c => (
              <li key={c.version}>
                <span className="v-num">v{c.version}</span>
                <span className="grow"><code>{JSON.stringify(c.config)}</code><small>{when(c.createdAt, d.timezone)} by {c.actor}</small></span>
                <Status value={c.appliedAt ? 'APPLIED' : 'PENDING'} />
              </li>
            ))}
            {!d.configurations.length && <li className="muted">Using the default configuration (version 0).</li>}
          </ol>
        </div>
      )}

      {tab === 'commands' && (
        <div className="tab-body">
          {manage && !archived && <CommandForm device={d} catalog={catalog} onSent={() => done('Command queued. The device receives it on its next check-in.')} />}
          <table className="compact">
            <thead><tr><th>Command</th><th>State</th><th>Requested</th></tr></thead>
            <tbody>{d.commands.length ? d.commands.map(c => <tr key={c.id}><td>{catalog.commands[c.command]?.label || human(c.command)}{c.parameters?.durationSeconds ? ` for ${c.parameters.durationSeconds} s` : ''}</td><td><Status value={c.state} /></td><td>{ago(c.createdAt)}</td></tr>)
              : <tr><td colSpan={3} className="muted">No commands yet.</td></tr>}</tbody>
          </table>
        </div>
      )}

      {tab === 'access' && <AccessTab device={d} archived={archived} />}

      {dialog === 'edit' && <EditDialog device={d} rooms={rooms.filter(r => r.houseId === d.houseId && r.status === 'ACTIVE')} onClose={() => setDialog(null)} onDone={() => done('Device updated.')} />}
      {dialog === 'config' && <ConfigDialog device={d} onClose={() => setDialog(null)} onDone={() => done(`Version ${d.configVersion + 1} published.`)} />}
      {dialog === 'archive' && <ArchiveDialog device={d} onClose={() => setDialog(null)} onDone={() => done('Device archived. Its history is kept.')} />}
    </Drawer>
  );
}

function CommandForm({ device, catalog, onSent }) {
  const allowed = Object.entries(catalog.commands).filter(([, c]) => c.types.includes(device.type));
  const [cmd, setCmd] = useState(allowed[0]?.[0]);
  const [secs, setSecs] = useState(60);
  const [confirm, setConfirm] = useState(null);
  const s = useSubmit(async key => {
    const parameters = catalog.commands[cmd].parameters.durationSeconds ? { durationSeconds: Number(secs) } : {};
    await api(`/devices/${device.id}/commands`, { method: 'POST', key, body: { command: cmd, parameters } });
    setConfirm(null); onSent();
  });
  const online = device.status === 'ONLINE';
  const range = catalog.commands[cmd]?.parameters.durationSeconds;
  return (
    <div className="cmd-form">
      {!online && <p className="banner banner-warn">Commands need an online device. This one is {human(device.status).toLowerCase()}.</p>}
      <div className="row wrap">
        <label className="sr-only" htmlFor="cmd">Command</label>
        <select id="cmd" value={cmd} onChange={e => setCmd(e.target.value)} disabled={!online}>{allowed.map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>
        {range && <><label className="sr-only" htmlFor="secs">Seconds</label><input id="secs" className="input-sm" type="number" min={range.min} max={range.max} value={secs} onChange={e => setSecs(e.target.value)} disabled={!online} /><span className="muted">seconds</span></>}
        {/* One idempotency key per confirmation: a double click or retry can't queue it twice. */}
        <button className="btn" disabled={!online} onClick={() => { s.setError(undefined); setConfirm({ key: newId() }); }}>Send</button>
      </div>
      {confirm && (
        <Confirm title={`${catalog.commands[cmd].label} on ${device.name}?`} action="Send command" busy={s.busy} onClose={() => setConfirm(null)} onConfirm={() => s.run(confirm.key)}>
          <p>The command is queued and delivered the next time the device checks in.{cmd === 'restart' && ' The device will be briefly unavailable.'}</p>
          <FormError error={s.error} />
        </Confirm>
      )}
    </div>
  );
}

function AccessTab({ device, archived }) {
  const [issued, setIssued] = useState('');
  const [ask, setAsk] = useState(null);
  const toast = useToast();
  const s = useSubmit(async revoke => {
    const r = await api(`/devices/${device.id}/credentials`, { method: 'POST', body: revoke ? { revoke: true } : {} });
    setAsk(null);
    if (revoke) { setIssued(''); toast('Credential revoked. The device can no longer connect.'); } else setIssued(r.credential);
  });
  return (
    <div className="tab-body">
      <p>A device proves who it is with its own credential. Issuing a new one revokes the previous one immediately.</p>
      {!archived && <div className="row wrap">
        <button className="btn btn-primary" onClick={() => setAsk('issue')}>Issue new credential</button>
        <button className="btn btn-danger-outline" onClick={() => setAsk('revoke')}>Revoke access</button>
      </div>}
      <FormError error={s.error} />
      {issued && (
        <div className="reveal" role="status">
          <p><strong>Copy this credential now.</strong> It is shown only once.</p>
          <div className="copy-row"><input readOnly value={issued} onFocus={e => e.target.select()} aria-label="Device credential" className="mono" />
            <button className="btn" onClick={() => navigator.clipboard?.writeText(issued).then(() => toast('Copied.'))}><Icon name="copy" size={16} />Copy</button></div>
          <p className="hint">The device sends it as <code>Authorization: Device &lt;credential&gt;</code>.</p>
        </div>
      )}
      {ask && <Confirm title={ask === 'issue' ? 'Issue a new credential?' : 'Revoke device access?'} danger={ask === 'revoke'} action={ask === 'issue' ? 'Issue credential' : 'Revoke access'} busy={s.busy} onClose={() => setAsk(null)} onConfirm={() => s.run(ask === 'revoke')}>
        <p>{ask === 'issue' ? 'Any credential the device has now stops working. Give it the new one.' : 'The device stops being able to send heartbeats or events until a new credential is issued.'}</p>
      </Confirm>}
    </div>
  );
}

function EditDialog({ device, rooms, onDone, onClose }) {
  const [name, setName] = useState(device.name);
  const [roomId, setRoomId] = useState(device.roomId);
  const s = useSubmit(async () => { await api(`/devices/${device.id}`, { method: 'PATCH', body: { expectedVersion: device.version, ...(name !== device.name ? { name } : {}), ...(roomId !== device.roomId ? { roomId } : {}) } }); onDone(); });
  return (
    <Dialog title={`Rename or move ${device.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={s.busy || (name === device.name && roomId === device.roomId)} onClick={() => s.run()}>Save changes</button></>}>
      {s.error?.code === 'STALE_VERSION' ? <p className="banner banner-bad">The device changed since you opened it (for example a heartbeat). Close and try again.</p> : <FormError error={s.error} />}
      <Field label="Name" error={s.error?.field('name')}>{p => <input {...p} value={name} onChange={e => setName(e.target.value)} />}</Field>
      <Field label="Room" hint="Rooms in the same house">{p => <select {...p} value={roomId} onChange={e => setRoomId(e.target.value)}>{rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</Field>
    </Dialog>
  );
}

function ConfigDialog({ device, onDone, onClose }) {
  const [text, setText] = useState(JSON.stringify(device.config || {}, null, 2));
  const [parseErr, setParseErr] = useState('');
  const s = useSubmit(async config => { await api(`/devices/${device.id}`, { method: 'PATCH', body: { config, expectedVersion: device.version } }); onDone(); });
  const submit = () => {
    let v; try { v = JSON.parse(text); } catch { setParseErr("This isn't valid JSON. Check quotes and commas."); return; }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { setParseErr('Settings must be a JSON object, for example {"sensitivity": "high"}.'); return; }
    setParseErr(''); s.run(v);
  };
  return (
    <Dialog wide title={`Publish configuration version ${device.configVersion + 1}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={s.busy} onClick={submit}>Publish</button></>}>
      <p>Starts from the current version. The device moves to Provisioning until it reports the new version.</p>
      {s.error?.code === 'STALE_VERSION' ? <p className="banner banner-bad">The device changed since you opened this. Close and try again.</p> : <FormError error={s.error} />}
      <Field label="Settings (JSON)" error={parseErr}>{p => <textarea {...p} className="mono" rows={9} spellCheck={false} value={text} onChange={e => setText(e.target.value)} />}</Field>
    </Dialog>
  );
}

function ArchiveDialog({ device, onDone, onClose }) {
  const [reason, setReason] = useState('');
  const s = useSubmit(async () => { await api(`/devices/${device.id}`, { method: 'PATCH', body: { status: 'ARCHIVED', reason, expectedVersion: device.version } }); onDone(); });
  return (
    <Dialog title={`Archive ${device.name}?`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Keep device</button><button className="btn btn-danger" disabled={s.busy || reason.trim().length < 3} onClick={() => s.run()}>Archive device</button></>}>
      <p>The device leaves active inventory and its credential is revoked. Pending commands are cancelled. Its history, configurations and audit records are kept. This can't be undone; register a new device to replace it.</p>
      <FormError error={s.error} />
      <Field label="Reason" hint="At least 3 characters, for example: replaced with newer model">{p => <input {...p} value={reason} onChange={e => setReason(e.target.value)} />}</Field>
    </Dialog>
  );
}
