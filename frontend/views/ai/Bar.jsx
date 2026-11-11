import React from 'react';

/** Horizontal bar; the value is also given as text so it isn't conveyed by length alone. */
export function Bar({ value, label, tone = 'ok' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className={`bar tone-${tone}`} role="img" aria-label={label}>
      <span className="bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
