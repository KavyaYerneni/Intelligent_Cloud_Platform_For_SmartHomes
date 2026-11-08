import React, { useState } from 'react';
import { api } from '../../lib/api';
import { human } from '../../lib/format';
import { Dialog } from '../../ui/Overlay';
import { Field, FormError, useSubmit } from '../../ui/Form';
import Icon from '../../ui/Icon';

// Capability suggestions per type. The server accepts any short labels; these are
// shortcuts, and "Add" lets a technician type others.
const SUGGEST = {
  camera: ['video', 'motion', 'audio', 'night_vision'], microphone: ['audio', 'mute', 'sound_classification'],
  sensor: ['smoke', 'temperature', 'motion'], appliance: ['power', 'mute', 'status'], gateway: ['relay', 'wifi', 'zigbee'],
};
const ZONES = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'UTC'];
const footer = (onClose, label, busy, disabled) => <>
  <button type="button" className="btn" onClick={onClose}>Cancel</button>
  <button type="submit" form="dlg-form" className="btn btn-primary" disabled={busy || disabled}>{label}</button>
</>;

export function HouseDialog({ house, onDone, onClose }) {
  const [v, setV] = useState({ name: house?.name || '', address: house?.address || '', lat: house?.lat ?? 37.3382, lng: house?.lng ?? -121.8863, timezone: house?.timezone || 'America/Los_Angeles', status: house?.status || 'ACTIVE' });
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const s = useSubmit(async () => {
    const body = { name: v.name, address: v.address, lat: Number(v.lat), lng: Number(v.lng), timezone: v.timezone };
    const saved = house
      ? await api(`/houses/${house.id}`, { method: 'PATCH', body: { ...body, status: v.status, expectedVersion: house.version } })
      : await api('/houses', { method: 'POST', body });
    onDone(saved);
  });
  const conflict = s.error?.code === 'STALE_VERSION' ? 'Someone changed this house after you opened it. Close and reopen to see the latest.' : s.error?.code === 'CHILDREN_ACTIVE' ? 'Archive every room in this house first.' : null;
  return (
    <Dialog title={house ? `Edit ${house.name}` : 'Add a house'} onClose={onClose} footer={footer(onClose, house ? 'Save changes' : 'Add house', s.busy)}>
      <form id="dlg-form" onSubmit={e => { e.preventDefault(); s.run(); }} noValidate>
        {conflict ? <p className="banner banner-bad" role="alert">{conflict}</p> : <FormError error={s.error} />}
        <Field label="Name" error={s.error?.field('name') || (s.error?.code === 'DUPLICATE' ? 'A house with this name already exists.' : undefined)}>{p => <input {...p} value={v.name} onChange={set('name')} placeholder="Willow House" />}</Field>
        <Field label="Street address" error={s.error?.field('address')}>{p => <input {...p} value={v.address} onChange={set('address')} />}</Field>
        <div className="two">
          <Field label="Latitude" hint="-90 to 90" error={s.error?.field('lat')}>{p => <input {...p} inputMode="decimal" value={v.lat} onChange={set('lat')} />}</Field>
          <Field label="Longitude" hint="-180 to 180" error={s.error?.field('lng')}>{p => <input {...p} inputMode="decimal" value={v.lng} onChange={set('lng')} />}</Field>
        </div>
        <Field label="Time zone" hint="Times for this house are shown in this zone" error={s.error?.field('timezone') || (s.error?.code === 'TIMEZONE' ? s.error.message : undefined)}>
          {p => <><input {...p} list="zones" value={v.timezone} onChange={set('timezone')} /><datalist id="zones">{ZONES.map(z => <option key={z} value={z} />)}</datalist></>}
        </Field>
        {house && <Field label="Status" hint="Archiving needs every room archived first">{p => <select {...p} value={v.status} onChange={set('status')}><option value="ACTIVE">Active</option><option value="MAINTENANCE">Maintenance</option><option value="ARCHIVED">Archived</option></select>}</Field>}
      </form>
    </Dialog>
  );
}

export function RoomDialog({ house, onDone, onClose }) {
  const [name, setName] = useState('');
  const [roomType, setRoomType] = useState('living');
  const s = useSubmit(async () => onDone(await api(`/houses/${house.id}/rooms`, { method: 'POST', body: { name, roomType } })));
  return (
    <Dialog title={`Add a room to ${house.name}`} onClose={onClose} footer={footer(onClose, 'Add room', s.busy)}>
      <form id="dlg-form" onSubmit={e => { e.preventDefault(); s.run(); }} noValidate>
        <FormError error={s.error?.code === 'DUPLICATE' ? null : s.error} />
        <Field label="Room name" error={s.error?.field('name') || (s.error?.code === 'DUPLICATE' ? 'This house already has a room with that name.' : undefined)}>{p => <input {...p} value={name} onChange={e => setName(e.target.value)} placeholder="Kitchen" />}</Field>
        <Field label="Room type">{p => <select {...p} value={roomType} onChange={e => setRoomType(e.target.value)}>{['living', 'kitchen', 'bedroom', 'bathroom', 'hallway', 'entrance', 'other'].map(t => <option key={t} value={t}>{human(t)}</option>)}</select>}</Field>
      </form>
    </Dialog>
  );
}

export function DeviceDialog({ rooms, roomId, catalog, onDone, onClose, onOpenExisting }) {
  const active = rooms.filter(r => r.status === 'ACTIVE');
  const [v, setV] = useState({ roomId: roomId || active[0]?.id || '', type: 'microphone', name: '', serialNo: '', firmwareVersion: '1.0.0' });
  const [caps, setCaps] = useState(['audio']);
  const [extra, setExtra] = useState('');
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const toggle = c => setCaps(caps.includes(c) ? caps.filter(x => x !== c) : [...caps, c]);
  const s = useSubmit(async () => onDone(await api(`/rooms/${v.roomId}/devices`, { method: 'POST', body: { type: v.type, name: v.name, serialNo: v.serialNo, capabilities: caps, ...(v.firmwareVersion ? { firmwareVersion: v.firmwareVersion } : {}) } })));
  const existing = s.error?.body?.existingDeviceId;
  const options = [...new Set([...(SUGGEST[v.type] || []), ...caps])];
  return (
    <Dialog title="Register a device" onClose={onClose} footer={footer(onClose, 'Register device', s.busy, !v.roomId)}>
      <form id="dlg-form" onSubmit={e => { e.preventDefault(); s.run(); }} noValidate>
        <FormError error={s.error} />
        <div className="two">
          <Field label="Room">{p => <select {...p} value={v.roomId} onChange={set('roomId')}>{active.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</Field>
          <Field label="Type" error={s.error?.field('type')}>{p => <select {...p} value={v.type} onChange={e => { setV({ ...v, type: e.target.value }); setCaps(SUGGEST[e.target.value]?.slice(0, 1) || []); }}>{catalog.deviceTypes.map(t => <option key={t} value={t}>{human(t)}</option>)}</select>}</Field>
        </div>
        <Field label="Name" error={s.error?.field('name')}>{p => <input {...p} value={v.name} onChange={set('name')} placeholder="Living room microphone" />}</Field>
        <Field label="Serial number" error={s.error?.field('serialNo')}>{p => <input {...p} value={v.serialNo} onChange={set('serialNo')} autoComplete="off" placeholder="SN-1001" />}</Field>
        {existing && <p className="field-msg">That serial belongs to <button type="button" className="link" onClick={() => onOpenExisting(existing)}>an existing device</button>.</p>}
        <fieldset className={`field ${s.error?.field('capabilities') ? 'has-error' : ''}`}>
          <legend>Capabilities</legend>
          <div className="chips">
            {options.map(c => <label key={c} className={`chip ${caps.includes(c) ? 'on' : ''}`}><input type="checkbox" checked={caps.includes(c)} onChange={() => toggle(c)} />{human(c)}</label>)}
            <span className="chip-add">
              <label className="sr-only" htmlFor="cap-extra">Other capability</label>
              <input id="cap-extra" value={extra} onChange={e => setExtra(e.target.value)} placeholder="Other" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (extra.trim()) { setCaps([...new Set([...caps, extra.trim()])]); setExtra(''); } } }} />
              <button type="button" className="icon-btn" aria-label="Add capability" onClick={() => { if (extra.trim()) { setCaps([...new Set([...caps, extra.trim()])]); setExtra(''); } }}><Icon name="plus" size={16} /></button>
            </span>
          </div>
          {s.error?.field('capabilities') && <p className="field-msg">{s.error.field('capabilities')}</p>}
        </fieldset>
        <Field label="Firmware version" hint="Optional" error={s.error?.field('firmwareVersion')}>{p => <input {...p} value={v.firmwareVersion} onChange={set('firmwareVersion')} />}</Field>
      </form>
    </Dialog>
  );
}
