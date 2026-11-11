# Kavya — Alert tracking and real-time events

Events are immutable evidence; alerts are versioned workflows. The local classifier is explicit simulation/rules. smoke_alarm always maps to CRITICAL; help confidence >=0.85 maps HIGH; unusual sound is MEDIUM at 0.75 and HIGH at 0.90. Normal appliance sound is stored without an alert. Repeated delivery of the same event ID is distinct from grouping different event IDs from the same source/rule window.

Main files: `backend/domain.js` (`ALERT_RULES`, transition table), `backend/alerts.js`, `backend/processing.js`, `frontend/views/alerts/` (`Alerts.jsx` queue, `AlertDetail.jsx`, `lifecycle.js`), `frontend/views/simulator/preview.js`. Tests: `tests/unit/alerts.test.js`, `tests/ui/rules-parity.test.js` (simulator preview equals server `classify()` at every confidence step), `tests/ui/lifecycle.test.js` (note hints equal server guards), integration scenario, and the e2e acknowledge, investigate and resolve steps.

## Individual demonstration

1. In **Simulator**, choose **Unusual sound** and drag confidence: the outcome box changes from "Stored without an alert" (below 0.75) to Medium, then High at 0.90. It reads the same rule table as the server. Send at 0.94: a High alert appears in the queue. Send a below-threshold unusual sound and a normal appliance sound; both are stored with no alert.
2. **Replay last event**: the log says the server returned the original result and created no second record or alert. Send a new event of the same type from the same device inside the window: the alert's "events grouped" count rises instead. Explain replay idempotency versus grouping.
3. In **Alerts**, open the alert. Show the lifecycle stepper, "Why this alert", evidence with its confidence bar, and history. **Acknowledge**, assign a responder, add a note and **Start investigation**. Each step appears in the history with the actor's email.
4. **Escalate** from Active, Acknowledged or Investigating: the dialog requires a reason and records a simulated notification attempt. Open the same alert in two windows and act in both; the second shows "Someone else updated this alert" (stale version, 409).
5. **Resolve**: for critical/high the dialog keeps **Resolve alert** disabled until an outcome is written. There is no Acknowledge-to-Resolved shortcut and no manual reopen; a new matching event after resolution creates a new alert.
6. **Pause live updates** and send an event; it is stored but not shown until you resume. Set `NOTIFICATION_FAIL=true` for the worker to show failed simulated deliveries in the Notifications table without losing the alert.

## Recording checklist

- Show `tests/ui/rules-parity.test.js` passing: it proves the simulator preview and the server agree.
- Explain exact state table, not the abbreviated design storyboard.
- Capture confidence boundaries, replay, grouping, assignment and history.
- Show simulated notification status clearly; do not claim a real email/SMS was sent.
- Explain optimistic version checking and commit-before-push behavior.
- Show the corresponding unit/API test and its actual result.
