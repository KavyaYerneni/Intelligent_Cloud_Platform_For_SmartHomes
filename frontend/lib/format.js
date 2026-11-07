// Timestamps arrive in UTC. Where a house is known they are shown in that house's
// time zone (System Design 1.5), otherwise in the viewer's.
export function when(value, timeZone) {
  if (!value) return 'Never';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: timeZone ? 'short' : undefined }).format(new Date(value));
  } catch { return new Date(value).toLocaleString(); }
}
export function ago(value, now = Date.now()) {
  if (!value) return 'never';
  const s = Math.round((now - new Date(value).getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
export const clock = d => (d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');
export const human = s => String(s ?? '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
export const pct = n => (n === null || n === undefined ? 'Not provided' : `${Math.round(n * 100)}%`);
