import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, when } from '../../lib/format';
import { can } from '../../lib/roles';
import Status from '../../ui/Status';
import Icon from '../../ui/Icon';
import { Confirm } from '../../ui/Overlay';
import { FormError, useSubmit } from '../../ui/Form';
import { Empty, ErrorBox, Skeleton, StaleNote, useToast } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { DeviceDialog, HouseDialog, RoomDialog } from './forms';
import DeviceDrawer from './DeviceDrawer';

const PAGE = 25;

export default function Inventory({ arg }) {
  const { user, live, house, setHouse, houses, go } = useApp();
  const toast = useToast();
  const manage = can(user, 'manageInventory');
  const [room, setRoom] = useState('');
  const [f, setF] = useState({ q: '', status: '', type: '' });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const catalog = useLoad(() => api('/catalog'), []);
  const rooms = useLoad(() => (house ? api(`/houses/${house}/rooms`).then(r => r.items) : Promise.resolve([])), [house, live.version]);
  const devices = useLoad(() => api('/devices', { query: { houseId: house || undefined, roomId: room || undefined, q: f.q || undefined, status: f.status || undefined, type: f.type || undefined, page, pageSize: PAGE } }), [house, room, f, page, live.version]);
  const h = houses.find(x => x.id === house);
  const r = rooms.data?.find(x => x.id === room);
  const archiveRoom = useSubmit(async () => { await api(`/rooms/${r.id}`, { method: 'PATCH', body: { status: 'ARCHIVED', expectedVersion: r.version } }); setDialog(null); setRoom(''); toast('Room archived.'); rooms.reload(); });

  const pickHouse = id => { setHouse(id); setRoom(''); setPage(1); };
  const filter = patch => { setF({ ...f, ...patch }); setPage(1); };
  const pages = Math.max(1, Math.ceil((devices.data?.total || 0) / PAGE));
  const filtered = f.q || f.status || f.type;

  return (
    <div className="split-inventory">
      <nav className="panel tree" aria-label="Houses and rooms">
        <header className="panel-head"><h2>Houses</h2>{can(user, 'createHouse') && <button className="btn btn-sm" onClick={() => setDialog('house')}><Icon name="plus" size={16} />Add</button>}</header>
        <button className={`tree-item ${!house ? 'on' : ''}`} onClick={() => pickHouse('')}>All houses</button>
        {houses.map(x => (
          <div key={x.id}>
            <button className={`tree-item ${house === x.id && !room ? 'on' : ''}`} aria-current={house === x.id && !room ? 'true' : undefined} onClick={() => pickHouse(x.id)}>
              <Icon name="house" size={16} /><span className="grow">{x.name}</span>{x.status !== 'ACTIVE' && <Status value={x.status} quiet />}
            </button>
            {house === x.id && (
              <ul className="tree-rooms">
                {rooms.loading ? <li className="muted">Loading rooms</li> : !rooms.data?.length ? <li className="muted">No rooms yet</li>
                  : rooms.data.map(rm => (
                    <li key={rm.id}>
                      <button className={`tree-item ${room === rm.id ? 'on' : ''} ${rm.status === 'ARCHIVED' ? 'archived' : ''}`} onClick={() => { setRoom(rm.id); setPage(1); }} aria-current={room === rm.id ? 'true' : undefined}>
                        <span className="grow">{rm.name}</span>
                        <span className="tree-count" title={`${rm.onlineCount} of ${rm.deviceCount} devices online`}>{rm.status === 'ARCHIVED' ? 'archived' : `${rm.onlineCount}/${rm.deviceCount}`}</span>
                      </button>
                    </li>
                  ))}
                {manage && x.status === 'ACTIVE' && <li><button className="tree-add" onClick={() => setDialog('room')}><Icon name="plus" size={14} />Add room</button></li>}
              </ul>
            )}
          </div>
        ))}
        {!houses.length && <Empty title="No houses yet">{can(user, 'createHouse') ? 'Add the first house to start.' : 'No houses are assigned to you.'}</Empty>}
      </nav>

      <section className="panel" aria-labelledby="inv-h">
        <header className="panel-head">
          <div>
            <h2 id="inv-h">{r ? r.name : h ? h.name : 'All devices'}</h2>
            {h && <p className="muted">{h.address}. Times in {h.timezone}.</p>}
          </div>
          <div className="row wrap">
            {h && manage && h.status !== 'ARCHIVED' && <button className="btn" onClick={() => setDialog('editHouse')}>Edit house</button>}
            {r && manage && r.status === 'ACTIVE' && <button className="btn" onClick={() => setDialog('archiveRoom')}>Archive room</button>}
            {manage && (h && rooms.data?.some(x => x.status === 'ACTIVE')
              ? <button className="btn btn-primary" onClick={() => setDialog('device')}><Icon name="plus" size={16} />Register device</button>
              : <span className="hint">{h ? 'Add a room to register devices' : 'Choose a house to register devices'}</span>)}
          </div>
        </header>
        <div className="filters" role="search">
          <span className="search"><Icon name="search" size={16} /><label className="sr-only" htmlFor="dq">Search devices</label>
            <input id="dq" type="search" placeholder="Name or serial number" value={f.q} onChange={e => filter({ q: e.target.value })} /></span>
          <label className="sr-only" htmlFor="ds">Status</label>
          <select id="ds" value={f.status} onChange={e => filter({ status: e.target.value })}>
            <option value="">Any status</option>{['ONLINE', 'OFFLINE', 'PROVISIONING', 'REGISTERED', 'ARCHIVED'].map(s => <option key={s} value={s}>{s === 'REGISTERED' ? 'Waiting for first heartbeat' : human(s)}</option>)}
          </select>
          <label className="sr-only" htmlFor="dt">Type</label>
          <select id="dt" value={f.type} onChange={e => filter({ type: e.target.value })}>
            <option value="">Any type</option>{(catalog.data?.deviceTypes || []).map(t => <option key={t} value={t}>{human(t)}</option>)}
          </select>
          {filtered && <button className="btn btn-sm btn-ghost" onClick={() => filter({ q: '', status: '', type: '' })}>Clear filters</button>}
        </div>
        <StaleNote error={devices.error} at={devices.at} />
        {devices.loading ? <Skeleton rows={5} label="Loading devices" /> : !devices.data ? <ErrorBox error={devices.error} onRetry={devices.reload} />
          : !devices.data.items.length ? (
            <Empty title={filtered ? 'No devices match these filters' : r ? 'No devices in this room yet' : 'No devices yet'}>
              {manage && !filtered && h && rooms.data?.some(x => x.status === 'ACTIVE') && <button className="btn btn-primary btn-sm" onClick={() => setDialog('device')}>Register a device</button>}
            </Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Device</th><th>Type</th><th>Location</th><th>Status</th><th>Last heartbeat</th><th>Config</th></tr></thead>
                  <tbody>
                    {devices.data.items.map(d => (
                      <tr key={d.id} className={arg === d.id ? 'row-on' : ''}>
                        <td><a className="link" href={`#inventory/${d.id}`}>{d.name}</a><small className="sub">{d.serialNo}</small></td>
                        <td>{human(d.type)}</td>
                        <td>{d.roomName}{!house && <small className="sub">{d.houseName}</small>}</td>
                        <td><Status value={d.status} /></td>
                        <td title={when(d.lastSeen)}>{ago(d.lastSeen)}</td>
                        <td>v{d.reportedVersion}{d.reportedVersion < d.configVersion && <small className="sub">v{d.configVersion} pending</small>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav className="pager" aria-label="Device pages">
                <span>{devices.data.total} device{devices.data.total === 1 ? '' : 's'}</span>
                <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
              </nav>
            </>
          )}
      </section>

      {arg && catalog.data && <DeviceDrawer key={arg} id={arg} catalog={catalog.data} rooms={rooms.data || []} onClose={() => go('inventory')} onChanged={() => { devices.reload(); rooms.reload(); }} />}
      {dialog === 'house' && <HouseDialog onClose={() => setDialog(null)} onDone={x => { setDialog(null); toast(`${x.name} added.`); pickHouse(x.id); }} />}
      {dialog === 'editHouse' && h && <HouseDialog house={h} onClose={() => setDialog(null)} onDone={() => { setDialog(null); toast('House updated.'); }} />}
      {dialog === 'room' && h && <RoomDialog house={h} onClose={() => setDialog(null)} onDone={x => { setDialog(null); toast(`${x.name} added.`); rooms.reload(); setRoom(x.id); }} />}
      {dialog === 'device' && catalog.data && <DeviceDialog rooms={rooms.data || []} roomId={room} catalog={catalog.data} onClose={() => setDialog(null)}
        onOpenExisting={id => { setDialog(null); go('inventory', id); }}
        onDone={d => { setDialog(null); toast(`${d.name} registered. Send its first heartbeat from the simulator or issue it a credential.`); devices.reload(); rooms.reload(); go('inventory', d.id); }} />}
      {dialog === 'archiveRoom' && r && (
        <Confirm title={`Archive ${r.name}?`} danger action="Archive room" busy={archiveRoom.busy} onClose={() => setDialog(null)} onConfirm={() => archiveRoom.run()}>
          <p>The room is kept for history but can't receive new devices. Archive its devices first.</p>
          <FormError error={archiveRoom.error?.code === 'CHILDREN_ACTIVE' ? { message: 'This room still has active devices. Archive them first.' } : archiveRoom.error} />
        </Confirm>
      )}
      {catalog.error && <ErrorBox error={catalog.error} onRetry={catalog.reload} />}
    </div>
  );
}
