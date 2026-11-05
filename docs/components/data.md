# Srija — Database and IoT data management

PostgreSQL owns structured entities, permissions, alert workflow and durable intake/outbox records. MongoDB owns flexible event details, simulated AI results and heartbeat history. No distributed transaction spans them. The API first commits a recoverable staging envelope; the worker upserts Mongo evidence, then commits the relational completion and alert/live-log transaction. If interrupted, the immutable event ID makes replay safe.

Main files: `backend/db.js`, `backend/migrations/001_initial.sql`, `backend/migrate.js`, `backend/data.js`, `backend/processing.js`, `frontend/Data.jsx`. Tests: data unit bounds/idempotency and real-database integration scenario.

## Individual demonstration

1. Sign in as operator. Select a house and a valid UTC window, query events, filter type/device, page results, open evidence and export displayed page. An unbounded or >31-day range must fail.
2. Show PostgreSQL reference, Mongo evidence/provenance and CONSISTENT state. Explain unique event index, tenant/device/time index, routine 90-day TTL and preserved alert evidence. Replay event and demonstrate one record.
3. Stop MongoDB only. Submit another event while PostgreSQL stays available. Show PENDING, attempts, lag and degraded health; the accepted envelope remains durable.
4. Restart MongoDB and retry pending. Show CONSISTENT and lower backlog. For exhausted retries, demonstrate QUARANTINED then explicit authorized retry. Explain why a SQL intent is recorded before the design's Mongo-first write sequence.
5. Inspect audit history. Sign in as technician/owner and attempt data-health/reconcile APIs; server denies operator-only operations. House history still obeys house scope.

## Recording checklist

- Show actual UI queries and recovery, not only a database console.
- Explain authoritative store per entity and the staging-envelope lifecycle.
- Show constraints/migrations and Mongo indexes, without displaying connection secrets.
- Distinguish code implementation from test execution; use VALIDATION.md for delivery results.
- Explain remaining production backup/retention/managed database work honestly.
