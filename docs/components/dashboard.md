# Yaswanth — Dashboard and live map

The backend computes counts and house health from authorized SQL records. React consumes a snapshot, then subscribes to the durable live log. A live message triggers a new authoritative snapshot; this is deliberately simpler than maintaining several independent optimistic caches. Message versions prevent replaying older notifications. PostgreSQL transaction boundaries ensure the live log cannot announce uncommitted state.

Main files: `backend/dashboard.js`, `backend/live.js`, `frontend/Dashboard.jsx`, `frontend/Map.jsx`, `frontend/useLive.js`. Unit test: `tests/unit/dashboard.test.js`. Integration tests verify scoped socket delivery and reject another tenant's subscription.

## Individual demonstration

1. Sign in as operator. Show KPI totals, generated timestamp, authorized houses, map/table and recent activity. Explain that data comes from the API, not browser storage.
2. Select Willow House on map or table. Show devices, active alerts and timeline. Save map center/zoom, refresh and verify preference. Navigate to inventory/alerts from house details.
3. In another browser tab/session, send a simulator heartbeat and smoke alarm for H001. Show online state, alert count and ALERT marker without a page reload. Explain HIGH/CRITICAL > OFFLINE > HEALTHY/DEGRADED precedence.
4. Stop the API while keeping the browser open. Show disconnected/stale warning and retained last snapshot. Restart API and show automatic reconnect/snapshot refresh. Disable network tiles separately to show the table fallback.
5. Sign in as owner (only H001) or outsider (T002). Show restricted houses. Explain server-side scope checks; UI filtering is not the security boundary.

## Recording checklist

- Show your name/component and the local URL; keep `.env` and passwords off screen.
- Capture a readable map, table, timestamps, event change and reconnect.
- Explain one API request/response and the health-priority unit test.
- State that tile service is external, AI events simulated, databases real, and hosting is a separate step.
- Record and review your own video; no recording is supplied by this repository.

Defense question: why REST plus WebSocket? REST reconstructs current state after loss; WebSocket reduces update latency. Durable log sequence is a notification version, not a claim of exactly-once network delivery.
