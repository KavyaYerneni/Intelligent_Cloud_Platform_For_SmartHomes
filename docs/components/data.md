# Srija — Database and IoT data management

PostgreSQL owns structured entities, permissions, alert workflow and durable intake/outbox records. MongoDB owns flexible event details, simulated AI results and heartbeat history. No distributed transaction spans them. The API first commits a recoverable staging envelope; the worker upserts Mongo evidence, then commits the relational completion and alert/live-log transaction. If interrupted, the immutable event ID makes replay safe.

Main files: `backend/db.js`, `backend/migrations/` (001 schema, 002 UI indexes and retention support), `backend/migrate.js`, `backend/data.js`, `backend/processing.js` (including `pruneLiveEvents`), `frontend/views/data/` (`DataOps.jsx` health strip, history, reconciliation, audit; `EventDrawer.jsx`; `csv.js`). Tests: data unit bounds and idempotency, real-database integration scenario, `tests/ui/components.test.jsx` (CSV formula escaping), and the e2e stored-record and audit-log steps.

## Individual demonstration

1. Sign in as **Cloud operator**, choose a house in the House menu, open **Data operations**. Pick a time range (last hour to 31 days, or custom), filter by type or device, page through results and **Export this page as CSV**. Explain that the API rejects unbounded or longer than 31-day ranges.
2. Open an event. The drawer shows the three storage steps (PostgreSQL reference, MongoDB detail, Consistent), the classification ("Simulated or rule based. No trained model is used."), identifiers, and **Show raw record**. Explain the unique event index, tenant/device/time index, 90-day TTL for routine telemetry, and that alert evidence is kept. Replay an event in the Simulator and show there is still one record.
3. Stop only MongoDB (`docker compose stop mongo`) and send an event. The health strip shows MongoDB unavailable and records waiting to store; **Reconciliation** lists the event with attempts and the last problem. After five failures it is Quarantined. The accepted event stays durable in PostgreSQL.
4. Start MongoDB, then **Retry quarantined** (with confirmation) or **Retry pending**. Records become Stored, the backlog clears, and each qualifying event creates its alert exactly once. Explain why a SQL intent is committed before the Mongo write.
5. **Audit log** tab: sign-ins, inventory changes and alert transitions with actor emails. Sign in as technician or owner: the Reconciliation and Audit tabs are not offered and the server returns 403 for those APIs. History still follows house scope.

## Recording checklist

- The recovery in steps 3–4 was performed in the sandbox validation run; see `docs/VALIDATION.md`.
- Show actual UI queries and recovery, not only a database console.
- Explain authoritative store per entity and the staging-envelope lifecycle.
- Show constraints/migrations and Mongo indexes, without displaying connection secrets.
- Distinguish code implementation from test execution; use VALIDATION.md for delivery results.
- Explain remaining production backup/retention/managed database work honestly.
