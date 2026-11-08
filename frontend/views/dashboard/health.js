import { ago, human } from '../../lib/format';
// Pure helpers for the attention rail; unit-tested in tests/ui/health.test.jsx.
const RANK = { ALERT: 0, OFFLINE: 1, DEGRADED: 2, HEALTHY: 3 };
// House health follows C1 B-D-02 (only critical/high override). A healthy house
// with an open medium alert still has something to look at, so it is listed last.
const rank = h => (h.health === 'HEALTHY' && h.alerts.length ? 2.5 : RANK[h.health]);

export function needsAttention(houses) {
  return houses.filter(h => h.health !== 'HEALTHY' || h.alerts.length).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** One plain sentence saying why a house is on the attention rail. */
export function reason(h, now = Date.now()) {
  if (h.health === 'ALERT' || (h.health === 'HEALTHY' && h.alerts.length)) {
    const a = h.alerts.find(x => ['CRITICAL', 'HIGH'].includes(x.severity)) || h.alerts[0];
    const more = h.alerts.length - 1;
    return `${human(a.type)} from ${a.deviceName || 'a device'}, ${a.severity.toLowerCase()}, ${ago(a.createdAt, now)}${more > 0 ? `. ${more} more open alert${more > 1 ? 's' : ''}` : ''}.`;
  }
  if (h.health === 'OFFLINE') {
    const off = h.devices.filter(d => d.status === 'OFFLINE');
    return `${off.length === 1 ? off[0].name + ' is' : off.length + ' devices are'} offline. Last heartbeat ${ago(h.lastSeen, now)}.`;
  }
  if (!h.devices.length) return 'No devices registered yet.';
  const waiting = h.devices.filter(d => d.status !== 'ONLINE');
  return `${waiting.length === 1 ? waiting[0].name + ' is' : waiting.length + ' devices are'} not reporting yet.`;
}
