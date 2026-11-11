# Yaswanth — Dashboard and live map

The backend computes counts and house health from authorized SQL records. React consumes a snapshot, then subscribes to the durable live log. A live message triggers a new authoritative snapshot; this is deliberately simpler than maintaining several independent optimistic caches. Message versions prevent replaying older notifications. PostgreSQL transaction boundaries ensure the live log cannot announce uncommitted state.

Main files: `backend/dashboard.js`, `backend/live.js`, `frontend/views/dashboard/` (`Overview.jsx`, `HouseMap.jsx`, `HouseDrawer.jsx`, `health.js`), `frontend/lib/useLive.js`, `frontend/app/Shell.jsx` (live status pill). Tests: `tests/unit/dashboard.test.js` (health precedence), `tests/ui/attention.test.js` (attention ranking and wording), integration socket scope tests, and the e2e scenario's live alert badge check. Design rationale: `docs/UI_DESIGN.md`.

## Individual demonstration

1. Sign in as **Cloud operator**. The overview opens on the **Needs attention** rail: houses ranked alert, offline, degraded, then healthy-with-medium-alert, each with a one-sentence reason. Point out the count strip, snapshot time and the green **Live** pill with its last-update time. Data comes from the API, not browser storage.
2. Select a house on the rail, map marker or house table. The **house drawer** shows open alerts, devices grouped by room and the last 24 hours in the house's time zone. Use **Save map view**, reload, and show the saved center/zoom. Follow a device or alert link out of the drawer.
3. In a second window open **Simulator**, send a heartbeat and a smoke alarm for Willow House. Without reloading, the first window's rail, marker, counts and the red **Alerts** badge update. Explain precedence: critical/high alert > offline > degraded > healthy (rule B-D-02), and that a healthy house with a medium alert is still listed so it is never called "all clear".
4. Stop the API while the browser stays open. The pill turns to **Reconnecting**, a banner says screens may be out of date, and the last data stays visible. Restart the API: it reconnects and reloads automatically. If map tiles cannot load, a note points to the house table, which has the same information.
5. Sign out and sign in as **House owner** (Willow only). The House menu, rail and map show only Willow House. Explain that the server scopes every query and the WebSocket subscription; the UI only reflects that.

## Recording checklist

- Show the attention rail first and read one reason sentence aloud; it is the screen's main idea (see `docs/UI_DESIGN.md`).
- Show your name/component and the local URL; keep `.env` and passwords off screen.
- Capture a readable map, table, timestamps, event change and reconnect.
- Explain one API request/response and the health-priority unit test.
- State that tile service is external, AI events simulated, databases real, and hosting is a separate step.
- Record and review your own video; no recording is supplied by this repository.

Defense question: why REST plus WebSocket? REST reconstructs current state after loss; WebSocket reduces update latency. Durable log sequence is a notification version, not a claim of exactly-once network delivery.
