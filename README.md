# Intelligent Cloud Platform for Smart Homes

CMPE 281 Group 4 local implementation: React dashboard, Express APIs, PostgreSQL workflow persistence, MongoDB event evidence, durable background worker and deterministic simulator. Hosting is left to you. No AWS resource is provisioned by this repository.

## Run locally

Install Node.js 24 and Docker Desktop with Linux containers. Start Docker Desktop first.

```powershell
Copy-Item .env.example .env
# Edit .env: choose a random JWT_SECRET (32+ characters) and DEMO_PASSWORD (8+).
npm ci
docker compose up --build -d
```

Open [the application](http://localhost:3000). Sign in as `operator@demo.local` with the password you set in `.env`. The seed also creates `technician@demo.local`, `owner@demo.local`, `responder@demo.local`, and `outsider@demo.local`. Owner can access only H001; responder H001/H002; outsider belongs to a different tenant. Local passwords and JWT secrets are never committed. If `.env` already exists, preserve it instead of overwriting it.

Compose runs migrations and seed once before starting API and worker. PostgreSQL and MongoDB use persistent named volumes, with database ports and app port bound to localhost. The supplied database password is a local development value, not a deployment secret.

For frontend hot reload with databases in Docker:

```powershell
docker compose up -d postgres mongo
npm run migrate
npm run seed
npm run server
# In separate terminals:
npm run worker
npm run dev
```

Open the Vite address printed in the terminal (normally localhost:5173). Do not run both the Compose app and host API on port 3000. Migrations are ordered and recorded in `schema_migrations`; seed is idempotent and preserves existing passwords and records.

## Demonstrate the integration

1. In **Houses & devices**, add a house, room and microphone. Select the new house in the global context.
2. In **Simulator**, select the device and send a heartbeat. The simulator can apply desired configuration and acknowledge commands. Start periodic heartbeats if needed.
3. Open **Overview**: the device is online and the map/table show its house.
4. Send a `smoke_alarm` simulated event. The request is durably accepted; the worker persists Mongo evidence and creates a CRITICAL alert.
5. Observe the live update, then replay the same event. No second evidence or alert is created.
6. In **Alerts & response**, acknowledge, add an investigation note, investigate, then resolve with an outcome note. The state table intentionally prevents a direct acknowledge-to-resolve shortcut.
7. In **Data operations**, query the selected house and inspect event provenance, processing state, notification delivery and audit history.
8. Stop heartbeats, wait 45 seconds, verify OFFLINE; send another heartbeat to recover.
9. Sign in as owner or outsider and demonstrate house/role restrictions using the API tests below.

The map uses Leaflet/OpenStreetMap online tiles and falls back to the always-present house table when tiles fail. No paid map key is needed. Classification is explicitly simulated or rule-based; no trained model is included or claimed.

## Test

```powershell
npm test
npm run build
# Real database integration; requires migrated/seeded databases, no server needed:
npm run test:integration
# Browser scenario; requires the app AND worker running:
npx playwright install chromium
npm run test:e2e
# CLI simulator:
npm run simulate
npm run simulate -- --continuous
```

Integration tests create uniquely named synthetic houses, devices and events; they preserve existing data and archive their test device. Run against a disposable demo database, not production. The browser scenario uses seeded H001/D001 and records synthetic alerts. The actual verification outcome for this delivery is recorded in [docs/VALIDATION.md](docs/VALIDATION.md); do not treat provided tests as evidence they were run.

## Recovery, reset and shutdown

Stop only MongoDB to demonstrate partial writes: `docker compose stop mongo`. Submit an event, inspect PENDING and retry attempts, then `docker compose start mongo`; choose **Retry pending** in Data operations. After five failed attempts records become QUARANTINED; use **Retry quarantined** after restoring MongoDB. PostgreSQL must stay available to accept events. Failed requests should be retried with the original event ID and unchanged body. Notification failures can be demonstrated by setting `NOTIFICATION_FAIL=true` for the worker and restarting it; these are simulated delivery outcomes.

`docker compose down` stops the stack and **preserves data**. To create a separate fresh demo without deleting anything, use a new Compose project name (`docker compose -p group4-fresh up --build -d`) after stopping the old stack to free ports. Only if you deliberately want to erase this project's local data, `docker compose down --volumes` removes its PostgreSQL and MongoDB volumes; then restart and seed. Never use that command against data you need.

## Component ownership and presentation

| Component | Design owner | Main implementation | Presentation guide |
|---|---|---|---|
| Dashboard and live map | Yaswanth Dokala | `frontend/Dashboard.jsx`, `frontend/Map.jsx`, `backend/dashboard.js`, `backend/live.js` | [Dashboard demo](docs/components/dashboard.md) |
| Home and IoT devices | Siddharth Jetling | `frontend/Inventory.jsx`, `backend/inventory.js` | [Device demo](docs/components/devices.md) |
| Alert tracking | Kavya Yerneni | `frontend/Alerts.jsx`, `backend/alerts.js`, `backend/domain.js` | [Alert demo](docs/components/alerts.md) |
| Database and IoT data | Srija Nayakam | `frontend/Data.jsx`, `backend/data.js`, `backend/db.js`, migrations, worker | [Data demo](docs/components/data.md) |

These are design ownership boundaries, not claims about who authored the generated code. Each student should review, test and understand their component before presenting it.

See [API contracts](docs/API.md), [decisions and conflicts](docs/DECISIONS.md), [requirements matrix](docs/TRACEABILITY.md), [implementation status](docs/STATUS.md), and [EC2 handoff](docs/DEPLOYMENT.md). The professor's stated deliverables are component implementation with UI/backend demonstration and recorded scenario video; this repository's extra tests/checklists are supporting recommendations, not additional claimed rubric requirements.
