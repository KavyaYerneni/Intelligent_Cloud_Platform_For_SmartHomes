import React from 'react';
// Every status = label + shape + tone (System Design 5.5: never color alone).
// Shapes: dot good/done, tri needs action (severity), half in progress,
// ring not reporting / not picked up yet, square ended.
const S = {
  HEALTHY: ['Healthy', 'dot', 'ok'], ONLINE: ['Online', 'dot', 'ok'], RESOLVED: ['Resolved', 'dot', 'ok'],
  CONSISTENT: ['Stored', 'dot', 'ok'], ACKED: ['Acknowledged', 'dot', 'ok'], SENT: ['Sent', 'dot', 'ok'], APPLIED: ['Applied', 'dot', 'ok'],
  ALERT: ['Needs attention', 'tri', 'bad'], CRITICAL: ['Critical', 'tri', 'bad'], HIGH: ['High', 'tri', 'bad'],
  ACTIVE: ['Active', 'ring', 'warn'], FAILED: ['Failed', 'tri', 'bad'], EXHAUSTED: ['Gave up', 'tri', 'bad'], ESCALATED: ['Escalated', 'tri', 'bad'],
  MEDIUM: ['Medium', 'half', 'warn'], DEGRADED: ['Degraded', 'half', 'warn'], PROVISIONING: ['Provisioning', 'half', 'warn'],
  REGISTERED: ['Waiting for first heartbeat', 'half', 'warn'], PENDING: ['Pending', 'half', 'warn'], QUEUED: ['Queued', 'half', 'warn'],
  ACKNOWLEDGED: ['Acknowledged', 'half', 'warn'], INVESTIGATING: ['Investigating', 'half', 'warn'], MAINTENANCE: ['Maintenance', 'half', 'warn'],
  OFFLINE: ['Offline', 'ring', 'muted'], UNAVAILABLE: ['Unavailable', 'tri', 'bad'],
  ARCHIVED: ['Archived', 'square', 'muted'], EXPIRED: ['Expired', 'square', 'muted'], QUARANTINED: ['Quarantined', 'square', 'bad'],
  INFO: ['Info', 'dot', 'muted'], SIMULATED: ['Simulated', 'square', 'muted'],
};
export const look = key => {
  const k = String(key || '').toUpperCase();
  const [label, shape, tone] = S[k] || [k.charAt(0) + k.slice(1).toLowerCase().replaceAll('_', ' '), 'dot', 'muted'];
  return { label, shape, tone };
};
export default function Status({ value, label, quiet }) {
  const l = look(value);
  return (
    <span className={`status tone-${l.tone} ${quiet ? 'status-quiet' : ''}`}>
      <span className={`mark mark-${l.shape}`} data-shape={l.shape} aria-hidden="true" />
      {label || l.label}
    </span>
  );
}
