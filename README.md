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

**Why new houses show Degraded:** seeded devices start in REGISTERED state with no heartbeat. Starting the app/database containers does not start simulated devices. Use **Open device simulator** on a house, then **Send heartbeats every 10 s**. Keep that simulator page open; after heartbeats stop, the configured timeout (45 seconds by default) correctly changes devices to OFFLINE. A single heartbeat demonstrates recovery but does not keep a device online indefinitely.

**Map tiles:** the app uses the canonical OpenStreetMap tile URL and an origin-only referrer, as required by its tile policy. If the provider is unavailable, blocked error tiles are removed while house markers and the house table remain usable.

**Why new houses show Degraded:** seeded devices start in REGISTERED state with no heartbeat. Starting the app/database containers does not start simulated devices. Use **Open device simulator** on a house, then **Send heartbeats every 10 s**. Keep that simulator page open; after heartbeats stop, the configured timeout (45 seconds by default) correctly changes devices to OFFLINE. A single heartbeat demonstrates recovery but does not keep a device online indefinitely.

**Map tiles:** the app uses the canonical OpenStreetMap tile URL and an origin-only referrer, as required by its tile policy. If the provider is unavailable, blocked error tiles are removed while house markers and the house table remain usable.

The interface is described in [docs/UI_DESIGN.md](docs/UI_DESIGN.md). Sign in as **Cloud operator** (the sign-in page lists every demo role).

1. **Houses & devices**: **Add** a house, **Add room**, **Register device** (microphone). The device drawer opens showing *Waiting for first heartbeat*. Registering the same serial again is refused at the Serial number field with a link to the existing device.
2. Choose the house in the top **House** menu, open **Simulator**, **Send one heartbeat**.
3. **Overview**: the house shows its device online in the house table, map and drawer.
4. **Simulator**: pick **Smoke alarm** (the preview says it always creates a critical alert) and **Send event**. The request is accepted durably; the worker stores Mongo evidence and creates a CRITICAL alert.
5. Without reloading, the red **Alerts** badge and the overview's **Needs attention** list update. **Replay last event**: the log confirms no second record or alert.
6. **Alerts**: open the alert, **Acknowledge**, write a note, **Start investigation**, then **Resolve** with an outcome (required for critical/high). The stepper and history record each step. There is no shortcut from Acknowledged to Resolved.
7. **Stored record** on the evidence (or **Data operations**): see the PostgreSQL reference, MongoDB detail and *Consistent* state, the simulated/rule-based provenance, and the **Audit log** tab.
8. Turn on **Send heartbeats every 10 s**, then turn it off; after 45 seconds the device turns Offline everywhere. Turn it on again to recover.
9. Sign in as **House owner**: only Willow House is visible and no management controls appear. Data-operations APIs return 403 for non-operators.

The map uses Leaflet/OpenStreetMap online tiles; if tiles fail, a note points to the house table, which has the same information. Classification is explicitly simulated or rule-based; no trained model is included or claimed.

## Test

```powershell
npm test                      # backend unit tests (node:test)
npm run test:ui               # UI unit tests (Vitest): rule parity, lifecycle hints, components
npm run build
# Real database integration; requires migrated/seeded databases, no server needed:
npm run test:integration
# Browser scenario; requires the app AND worker running:
npx playwright install chromium
npm run test:e2e
# If Chromium can't be downloaded, point Playwright at an installed one:
#   $env:PLAYWRIGHT_EXECUTABLE_PATH="C:\path\to\chrome.exe"; npm run test:e2e
# CLI simulator:
npm run simulate
npm run simulate -- --continuous
```

Integration and browser tests create uniquely named synthetic houses, devices and events and preserve existing data. Run them against a disposable demo database, not production. Recorded results, including what was not verified, are in [docs/VALIDATION.md](docs/VALIDATION.md); do not treat the presence of tests as evidence they were run in your environment.

## Recovery, reset and shutdown

Stop only MongoDB to demonstrate partial writes: `docker compose stop mongo`. Submit an event, inspect PENDING and retry attempts, then `docker compose start mongo`; choose **Retry pending** in Data operations. After five failed attempts records become QUARANTINED; use **Retry quarantined** after restoring MongoDB. PostgreSQL must stay available to accept events. Failed requests should be retried with the original event ID and unchanged body. Notification failures can be demonstrated by setting `NOTIFICATION_FAIL=true` for the worker and restarting it; these are simulated delivery outcomes.

`docker compose down` stops the stack and **preserves data**. To create a separate fresh demo without deleting anything, use a new Compose project name (`docker compose -p group4-fresh up --build -d`) after stopping the old stack to free ports. Only if you deliberately want to erase this project's local data, `docker compose down --volumes` removes its PostgreSQL and MongoDB volumes; then restart and seed. Never use that command against data you need.

## Component ownership and presentation

| Component | Design owner | Main implementation | Presentation guide |
|---|---|---|---|
| Dashboard and live map | Yaswanth Dokala | `frontend/views/dashboard/`, `frontend/lib/useLive.js`, `backend/dashboard.js`, `backend/live.js` | [Dashboard demo](docs/components/dashboard.md) |
| Home and IoT devices | Siddharth Jetling | `frontend/views/inventory/`, `frontend/views/simulator/`, `backend/inventory.js` | [Device demo](docs/components/devices.md) |
| Alert tracking | Kavya Yerneni | `frontend/views/alerts/`, `backend/alerts.js`, `backend/domain.js` | [Alert demo](docs/components/alerts.md) |
| Database and IoT data | Srija Nayakam | `frontend/views/data/`, `backend/data.js`, `backend/db.js`, migrations, worker | [Data demo](docs/components/data.md) |

These are design ownership boundaries, not claims about who authored the generated code. Each student should review, test and understand their component before presenting it.

See [UI design](docs/UI_DESIGN.md), [API contracts](docs/API.md), [decisions and conflicts](docs/DECISIONS.md), [requirements matrix](docs/TRACEABILITY.md), [implementation status](docs/STATUS.md), and [EC2 handoff](docs/DEPLOYMENT.md). The professor's stated deliverables are component implementation with UI/backend demonstration and recorded scenario video; this repository's extra tests/checklists are supporting recommendations, not additional claimed rubric requirements.
