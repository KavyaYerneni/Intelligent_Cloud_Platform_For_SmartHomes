import React, { useId, useState } from 'react';

/** Label + control + inline message, linked with aria-describedby. */
export function Field({ label, error, hint, children, className = '' }) {
  const id = useId();
  const msg = `${id}-m`;
  const control = typeof children === 'function'
    ? children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? msg : undefined })
    : children;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {error ? <p className="field-msg" id={msg}>{error}</p> : hint ? <p className="hint" id={msg}>{hint}</p> : null}
    </div>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  const general = error.fieldErrors?.length ? 'Check the highlighted fields.' : error.message;
  return <p className="banner banner-bad" role="alert">{general}{error.correlationId && <span className="ref"> Reference {error.correlationId}</span>}</p>;
}

/** Runs an async submit, tracks busy/error, and returns the error for field display. */
export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const run = async (...args) => {
    setBusy(true); setError(undefined);
    try { return await fn(...args); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return { run, busy, error, setError };
}
