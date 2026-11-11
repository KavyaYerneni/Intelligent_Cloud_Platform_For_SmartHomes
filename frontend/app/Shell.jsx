import React from 'react';
import Icon from '../ui/Icon';
import { ROLE_LABEL, can } from '../lib/roles';
import { clock } from '../lib/format';
import { useApp } from './context';

export const VIEWS = [
  { id: 'overview', label: 'Overview', icon: 'overview', title: 'Community overview' },
  { id: 'inventory', label: 'Houses & devices', icon: 'house', title: 'Houses & devices' },
  { id: 'alerts', label: 'Alerts', icon: 'alert', title: 'Alerts & response' },
  { id: 'data', label: 'Data operations', icon: 'data', title: 'Data operations' },
  { id: 'simulator', label: 'Simulator', icon: 'play', title: 'Simulation studio', when: u => can(u, 'simulate') },
  { id: 'ai', label: 'AI models', icon: 'wave', title: 'AI models', when: u => can(u, 'aiView') },
];

const LIVE_TEXT = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting', stale: 'No updates, reconnecting', unauthorized: 'Live updates stopped' };

export default function Shell({ view, children, onSignOut, activeAlerts }) {
  const { user, live, houses, house, setHouse, go } = useApp();
  const current = VIEWS.find(v => v.id === view) || VIEWS[0];
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="sidebar">
        <div className="wordmark"><span className="wordmark-mark" aria-hidden="true" />EchoNest</div>
        <p className="tenant">{user.tenantName || user.tenantId}</p>
        <nav aria-label="Main">
          {VIEWS.filter(v => !v.when || v.when(user)).map(v => (
            <a key={v.id} href={`#${v.id}`} className={v.id === current.id ? 'on' : ''} aria-current={v.id === current.id ? 'page' : undefined}>
              <Icon name={v.icon} />{v.label}
              {v.id === 'alerts' && activeAlerts > 0 && <span className="nav-count" aria-label={`${activeAlerts} active`}>{activeAlerts}</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-user">
          <strong>{ROLE_LABEL[user.role]}</strong>
          <span>{user.email}</span>
          <button className="btn-ghost-dark" onClick={onSignOut}><Icon name="logout" size={16} />Sign out</button>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <h1>{current.title}</h1>
          <label className="house-picker">
            <span>House</span>
            <select value={house} onChange={e => setHouse(e.target.value)}>
              <option value="">All houses{user.houseIds ? ' I can see' : ''}</option>
              {houses.filter(h => h.status !== 'ARCHIVED').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          <div className={`live live-${live.state}`} role="status" aria-live="polite">
            <span className="live-dot" aria-hidden="true" />
            <span>{LIVE_TEXT[live.state] || live.state}</span>
            {live.lastAt && <span className="live-time">updated {clock(live.lastAt)}</span>}
          </div>
        </header>
        {live.state !== 'live' && live.state !== 'connecting' && (
          <p className="banner banner-warn banner-flush" role="status">
            Live updates are interrupted. Screens show the last data they loaded and may be out of date. {live.state === 'unauthorized' ? 'Sign in again.' : 'Reconnecting automatically.'}
          </p>
        )}
        <main id="main" tabIndex={-1} className={`content view-${view}`}>{children}</main>
      </div>
      
    </div>
  );
}
