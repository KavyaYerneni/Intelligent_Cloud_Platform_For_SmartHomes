import React, { useState } from 'react';
import { api } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { ago, human, pct, when } from '../../lib/format';
import { can } from '../../lib/roles';
import Status from '../../ui/Status';
import { Dialog } from '../../ui/Overlay';
import { Field, FormError, useSubmit } from '../../ui/Form';
import { ErrorBox, Skeleton, useToast } from '../../ui/Feedback';
import { useApp } from '../../app/context';
import { STEPS, STEP_LABEL, VERB, noteRequirement, reached } from './lifecycle';

const ACTION_TEXT = { ALERT_CREATED: 'Alert raised', ALERT_GROUPED: 'Matching event grouped into this alert', ALERT_TRANSITION: 'State changed', ALERT_ASSIGNED: 'Assigned', SIMULATED_NOTIFICATION: 'Simulated notification attempt' };

/** One sentence saying which of the offered actions need a note. */
function noteHint(a) {
  const need = a.allowedActions.filter(t => noteRequirement(t, a)).map(t => VERB[t].toLowerCase());
  return need.length ? `Saved to the history with your name. Needed to ${need.join(' or ')}.` : 'Saved to the history with your name.';
}

export default function AlertDetail({ id, onChanged }) {
  const { user, live, go } = useApp();
  const toast = useToast();
  const alert = useLoad(() => api(`/alerts/${id}`), [id, live.version]);
  const users = useLoad(() => (can(user, 'respond') ? api('/users').then(r => r.items) : Promise.resolve([])), [user.role]);
  const [note, setNote] = useState('');
  const [dialog, setDialog] = useState(null);
  const [assignee, setAssignee] = useState('');

  const act = useSubmit(async (target, body) => {
    const a = alert.data;
    if (target === 'ESCALATED') await api(`/alerts/${a.id}/escalate`, { method: 'POST', body: { ...body, expectedVersion: a.version } });
    else await api(`/alerts/${a.id}/state`, { method: 'PATCH', body: { targetState: target, note: body?.note ?? note, expectedVersion: a.version } });
    toast(`${STEP_LABEL[target] || 'Escalated'}.`);
    setNote(''); setDialog(null);
    await alert.reload(); onChanged();
  });
  const assign = useSubmit(async () => {
    const a = alert.data;
    await api(`/alerts/${a.id}/assign`, { method: 'POST', body: { assigneeId: assignee, note, expectedVersion: a.version } });
    toast('Alert assigned.'); setAssignee('');
    await alert.reload(); onChanged();
  });

  if (alert.loading) return <div className="panel"><Skeleton rows={6} label="Loading alert" /></div>;
  if (!alert.data) return <div className="panel"><ErrorBox error={alert.error} onRetry={alert.reload} /></div>;
  const a = alert.data;
  const done = reached(a);
  const stale = act.error?.code === 'STALE_VERSION' || assign.error?.code === 'ASSIGN_CONFLICT';
  const run = target => {
    if (target === 'ESCALATED' || target === 'RESOLVED') { act.setError(undefined); setDialog(target); return; }
    act.run(target);
  };

  return (
    <article className="panel alert-detail" aria-labelledby="ad-h">
      <header className="ad-head">
        <div>
          <h2 id="ad-h">{human(a.type)} at {a.houseName}</h2>
          <p className="muted">{a.deviceName} in {a.roomName}. Raised {when(a.createdAt, a.timezone)}. {a.evidenceCount} event{a.evidenceCount > 1 ? 's' : ''} grouped.</p>
        </div>
        <div className="row"><Status value={a.severity} /><Status value={a.state} /></div>
      </header>

      <ol className="stepper" aria-label="Alert lifecycle">
        {STEPS.map((s, i) => (
          <li key={s} className={`${done.has(s) ? 'done' : ''} ${done.has(STEPS[i + 1]) ? 'next-done' : ''} ${a.state === s ? 'now' : ''}`} aria-current={a.state === s ? 'step' : undefined}>
            <span className="step-dot" aria-hidden="true">{i + 1}</span><span>{STEP_LABEL[s]}</span>
          </li>
        ))}
        {done.has('ESCALATED') && <li className={`branch ${a.state === 'ESCALATED' ? 'now' : 'done'}`}><span className="step-dot" aria-hidden="true">!</span><span>Escalated</span></li>}
      </ol>
      <p className="explain">Why this alert: {a.explanation}.</p>

      {stale && <p className="banner banner-warn" role="status">Someone else updated this alert. The latest version is shown; check it and try again.</p>}
      {a.allowedActions.length > 0 ? (
        <section className="action-box" aria-label="Respond">
          <Field label="Note" hint={noteHint(a)}
            error={act.error?.code === 'NOTE_REQUIRED' && !dialog ? act.error.message : undefined}>
            {p => <textarea {...p} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="What did you check or do?" />}
          </Field>
          <div className="row wrap">
            {a.allowedActions.map(t => (
              <button key={t} className={`btn ${t === 'ESCALATED' ? 'btn-danger-outline' : t === a.allowedActions[0] ? 'btn-primary' : ''}`} onClick={() => run(t)} disabled={act.busy}>{VERB[t]}</button>
            ))}
          </div>
          {act.error && !dialog && act.error.code !== 'NOTE_REQUIRED' && !stale && <FormError error={act.error} />}
          {users.data?.length > 0 && a.state !== 'RESOLVED' && (
            <div className="assign row">
              <label className="sr-only" htmlFor="assignee">Assign to</label>
              <select id="assignee" value={assignee} onChange={e => setAssignee(e.target.value)}>
                <option value="">{a.assigneeEmail ? `Assigned to ${a.assigneeEmail}` : 'Assign to a responder'}</option>
                {users.data.filter(u => ['operator', 'responder'].includes(u.role)).map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
              </select>
              <button className="btn" disabled={!assignee || assign.busy} onClick={() => assign.run()}>Assign</button>
            </div>
          )}
          {assign.error && !stale && <FormError error={assign.error} />}
        </section>
      ) : (
        <p className="muted action-none">{a.state === 'RESOLVED' ? 'This alert is resolved. A new matching event creates a new alert.' : 'Your role can view this alert but not change it.'}</p>
      )}

      <section className="ad-section">
        <h3>Evidence</h3>
        {a.evidence.map(e => (
          <div key={e.id} className="evidence">
            <div className="grow">
              <strong>{human(e.type)}</strong>
              <small>{e.source === 'simulator' ? 'Simulated event' : `From ${e.source}`}, {when(e.occurredAt, a.timezone)}</small>
              {e.confidence !== null && <div className="conf" aria-label={`Confidence ${pct(e.confidence)}`}><span style={{ width: pct(e.confidence) }} /><em>{pct(e.confidence)} confidence</em></div>}
            </div>
            <button className="btn btn-sm" onClick={() => go('data', e.id)}>Stored record</button>
          </div>
        ))}
      </section>

      <section className="ad-section">
        <h3>History</h3>
        <ol className="history">
          {a.history.map(h => (
            <li key={h.id}>
              <span className="h-when">{when(h.createdAt, a.timezone)}</span>
              <span className="h-what"><strong>{h.detail?.toState && h.action === 'ALERT_TRANSITION' ? `${STEP_LABEL[h.detail.fromState] || human(h.detail.fromState)} to ${STEP_LABEL[h.detail.toState] || 'Escalated'}` : ACTION_TEXT[h.action] || human(h.action)}</strong>
                <small>{h.actorEmail || (h.actor.includes('worker') ? 'System' : h.actor)}</small>
                {h.detail?.note && <q>{h.detail.note}</q>}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ad-section">
        <h3>Notifications <Status value="SIMULATED" label="Simulated delivery" quiet /></h3>
        {a.notifications.length ? (
          <table className="compact"><thead><tr><th>Recipient</th><th>Status</th><th>Attempts</th><th>Problem</th></tr></thead>
            <tbody>{a.notifications.map(n => <tr key={n.id}><td>{human(n.recipient)}</td><td><Status value={n.status} /></td><td>{n.attempts}</td><td>{n.lastError ? human(n.lastError) : 'None'}</td></tr>)}</tbody></table>
        ) : <p className="muted">No notification was needed for this alert.</p>}
      </section>

      {dialog === 'RESOLVED' && <ResolveDialog alert={a} initial={note} busy={act.busy} error={act.error} onClose={() => setDialog(null)} onSubmit={n => act.run('RESOLVED', { note: n })} />}
      {dialog === 'ESCALATED' && <EscalateDialog busy={act.busy} error={act.error} initial={note} onClose={() => setDialog(null)} onSubmit={b => act.run('ESCALATED', b)} />}
    </article>
  );
}

function ResolveDialog({ alert, initial, busy, error, onClose, onSubmit }) {
  const [n, setN] = useState(initial);
  const required = ['HIGH', 'CRITICAL'].includes(alert.severity);
  return (
    <Dialog title="Resolve this alert" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy || (required && !n.trim())} onClick={() => onSubmit(n)}>Resolve alert</button>
    </>}>
      <p>Record what happened. The outcome is kept in the alert history.</p>
      <FormError error={error} />
      <Field label={required ? 'Outcome (required)' : 'Outcome'}>{p => <textarea {...p} rows={4} value={n} onChange={e => setN(e.target.value)} placeholder="For example: confirmed with resident, alarm was triggered by cooking smoke." />}</Field>
    </Dialog>
  );
}

function EscalateDialog({ initial, busy, error, onClose, onSubmit }) {
  const [reason, setReason] = useState(initial);
  const [target, setTarget] = useState('tenant-response-team');
  return (
    <Dialog title="Escalate this alert" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-danger" disabled={busy || !reason.trim()} onClick={() => onSubmit({ reason, target })}>Escalate</button>
    </>}>
      <p>Escalation records a notification attempt to the chosen party. Delivery is simulated in this prototype.</p>
      <FormError error={error} />
      <Field label="Notify">{p => <select {...p} value={target} onChange={e => setTarget(e.target.value)}><option value="tenant-response-team">Tenant response team</option><option value="emergency-contact">Emergency contact</option><option value="security-party">Security party</option></select>}</Field>
      <Field label="Reason (required)">{p => <textarea {...p} rows={3} value={reason} onChange={e => setReason(e.target.value)} />}</Field>
    </Dialog>
  );
}
