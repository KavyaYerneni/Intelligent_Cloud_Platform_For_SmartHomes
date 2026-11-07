import React, { createContext, useCallback, useContext, useState } from 'react';
import { clock } from '../lib/format';

export function Skeleton({ rows = 3, label = 'Loading' }) {
  return <div className="skeleton" role="status"><span className="sr-only">{label}</span>{Array.from({ length: rows }, (_, i) => <span key={i} />)}</div>;
}

export function Empty({ title, children }) {
  return <div className="empty"><p className="empty-title">{title}</p>{children}</div>;
}

/** Errors say what happened and what to do; 403 has its own copy. */
export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  if (error.status === 403) return <div className="banner banner-bad" role="alert"><strong>You don't have access to this.</strong> It's outside your role or house scope.</div>;
  return (
    <div className="banner banner-bad" role="alert">
      <strong>{error.message}</strong>{error.correlationId && <span className="ref"> Reference {error.correlationId}</span>}
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** Shows when a reload failed but older data is still on screen. */
export function StaleNote({ error, at }) {
  if (!error || !at) return null;
  return <p className="banner banner-warn" role="status">Couldn't refresh. Showing data from {clock(at)}.</p>;
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = 'ok') => {
    const id = Math.random();
    setItems(x => [...x, { id, text, tone }]);
    setTimeout(() => setItems(x => x.filter(t => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{items.map(t => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label, count]) => (
        <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          {label}{count !== undefined && <span className="count">{count}</span>}
        </button>
      ))}
    </div>
  );
}
