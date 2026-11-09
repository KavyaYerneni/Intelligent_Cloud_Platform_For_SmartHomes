// Presentation of the Component 3 state table (the server enforces it).
export const STEPS = ['ACTIVE', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED'];
export const VERB = { ACKNOWLEDGED: 'Acknowledge', INVESTIGATING: 'Start investigation', ESCALATED: 'Escalate', RESOLVED: 'Resolve' };
export const STEP_LABEL = { ACTIVE: 'Raised', ACKNOWLEDGED: 'Acknowledged', INVESTIGATING: 'Investigating', RESOLVED: 'Resolved' };

/** States this alert has passed through, from its audit history. */
export function reached(alert) {
  const s = new Set(['ACTIVE']);
  for (const h of alert.history || []) if (h.detail?.toState) s.add(h.detail.toState);
  s.add(alert.state);
  return s;
}

/** Note rules shown before the user tries (mirrors domain.checkTransition). */
export function noteRequirement(target, alert) {
  if (target === 'ESCALATED') return 'An escalation reason is required.';
  if (target === 'RESOLVED' && ['HIGH', 'CRITICAL'].includes(alert.severity)) return 'An outcome note is required to resolve a high or critical alert.';
  if (target === 'INVESTIGATING' && !alert.assignedTo) return 'Add an investigation note, or assign the alert first.';
  return null;
}
