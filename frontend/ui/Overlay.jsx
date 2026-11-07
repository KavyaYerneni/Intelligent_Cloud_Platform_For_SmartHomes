import React, { useEffect, useRef } from 'react';
import Icon from './Icon';

function useDismiss(onClose, ref) {
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.querySelector('[data-autofocus], input, select, textarea, button:not(.x)')?.focus();
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [onClose, ref]);
}

/** Modal dialog: labelled, Escape closes, focus returns to the opener. */
export function Dialog({ title, onClose, children, footer, wide }) {
  const ref = useRef();
  useDismiss(onClose, ref);
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <header><h2 id="dlg-title">{title}</h2><button className="x icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        <div className="dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** Side sheet for record detail, keeps the list visible beside it. */
export function Drawer({ title, subtitle, onClose, children, actions }) {
  const ref = useRef();
  useDismiss(onClose, ref);
  return (
    <aside ref={ref} className="drawer" role="dialog" aria-modal="false" aria-labelledby="drw-title">
      <header>
        <div><h2 id="drw-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <div className="row">{actions}<button className="x icon-btn" onClick={onClose} aria-label="Close panel"><Icon name="close" /></button></div>
      </header>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

/** Confirmation that names the action and explains the effect. */
export function Confirm({ title, children, action, danger, onConfirm, onClose, busy }) {
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy} data-autofocus>{action}</button>
    </>}>{children}</Dialog>
  );
}
