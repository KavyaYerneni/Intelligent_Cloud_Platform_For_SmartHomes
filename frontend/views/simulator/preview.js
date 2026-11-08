// Preview of what the server's classify() will decide, from the rule table served
// by GET /catalog. Display only: the worker classifies authoritatively.
export function preview(rule, confidence) {
  if (!rule) return { severity: null, text: 'Unknown event type.' };
  if (!rule.severity) return { severity: null, text: 'Stored without an alert.' };
  if (rule.rule === 'safety') return { severity: rule.severity, text: `Always creates a ${rule.severity.toLowerCase()} alert (safety rule).` };
  if (confidence < rule.threshold) return { severity: null, text: `Stored without an alert: confidence is below ${rule.threshold.toFixed(2)}.` };
  const sev = rule.highAt !== undefined && confidence >= rule.highAt ? 'HIGH' : rule.severity;
  return { severity: sev, text: `Creates a ${sev.toLowerCase()} alert.` };
}

export function ruleText(rule) {
  if (!rule.severity) return 'Never alerts';
  if (rule.rule === 'safety') return `Always ${rule.severity.toLowerCase()}`;
  const s = rule.severity.charAt(0) + rule.severity.slice(1).toLowerCase();
  return `${s} at ${rule.threshold.toFixed(2)} or more${rule.highAt ? `, high at ${rule.highAt.toFixed(2)}` : ''}`;
}
