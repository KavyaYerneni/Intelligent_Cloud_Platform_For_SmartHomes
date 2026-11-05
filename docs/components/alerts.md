# Kavya — Alert tracking and real-time events

Events are immutable evidence; alerts are versioned workflows. The local classifier is explicit simulation/rules. smoke_alarm always maps to CRITICAL; help confidence >=0.85 maps HIGH; unusual sound is MEDIUM at 0.75 and HIGH at 0.90. Normal appliance sound is stored without an alert. Repeated delivery of the same event ID is distinct from grouping different event IDs from the same source/rule window.

Main files: `backend/domain.js`, `backend/alerts.js`, `backend/processing.js`, `frontend/Alerts.jsx`. Tests: `tests/unit/alerts.test.js`, data contract unit test and integrated scenario.

## Individual demonstration

1. Send simulated unusual_sound at 0.94. Show 202 acceptance, source/model provenance and HIGH alert. Send below-threshold unusual_sound and normal_appliance_sound; show retained events without new alerts.
2. Replay the identical event; show no duplicate evidence/alert. Send a different event ID of the same type/device in the window; show evidence count increase. Explain grouping versus replay idempotency.
3. Open detail, acknowledge, assign an active scoped responder, and investigate. Show actor/time/state history.
4. Escalate an ACTIVE/ACKNOWLEDGED/INVESTIGATING alert with a reason. Show ESCALATED and simulated notification attempt. Two browsers updating the same expectedVersion should cause a stale 409 in the second request.
5. Resolve from INVESTIGATING or ESCALATED with an outcome note. Show critical/high blank-note rejection. Direct ACTIVE-to-RESOLVED and manual reopening are disallowed. A new matching event after resolution creates a new alert with fresh evidence.
6. Pause/resume the stream and demonstrate snapshot recovery. Set worker NOTIFICATION_FAIL=true for a controlled simulation; show failed attempts without losing the alert.

## Recording checklist

- Explain exact state table, not the abbreviated design storyboard.
- Capture confidence boundaries, replay, grouping, assignment and history.
- Show simulated notification status clearly; do not claim a real email/SMS was sent.
- Explain optimistic version checking and commit-before-push behavior.
- Show the corresponding unit/API test and its actual result.
