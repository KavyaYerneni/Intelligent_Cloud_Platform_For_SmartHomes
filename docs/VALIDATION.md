# Validation record

Actual results only. Re-run these on your own machine before the demo and record the outcome; a pass here is not a pass in your environment.

## Run of 2026-11-06 (sandbox, after the UI redesign)

**Environment.** Linux sandbox, Node 22.23, PostgreSQL 16.15, **FerretDB 1.24 instead of MongoDB** (MongoDB downloads were blocked there). FerretDB speaks the MongoDB wire protocol but does not implement TTL indexes, so `migrate.js` stops at the first TTL index; the other indexes were created by hand for the run. Docker was not available, so `compose.yaml` was **not** exercised. Browser tests used Playwright with a Chromium 131 build supplied through `PLAYWRIGHT_EXECUTABLE_PATH`.

| Suite | Command | Result |
|---|---|---|
| Backend unit | `npm test` | 7 passed, 0 failed |
| UI unit | `npm run test:ui` | 15 passed (4 files) |
| API + database integration | `npm run test:integration` | 8 passed, 0 failed (2 existing + 6 in `ui-support.test.js`) |
| Production build | `npm run build` | succeeded |
| Browser end-to-end | `npx playwright test` | 2 passed (full operator scenario; owner restrictions) |

**Tests shown able to fail.** Disabling the explicit duplicate-serial check made the e2e scenario fail (the database still blocked the row, but the UI lost the field message and the link to the existing device). Restoring the code made it pass.

**Failure and recovery, observed.** During this run FerretDB lost its catalog, so every MongoDB write failed. The worker retried each of 7 events five times and marked them QUARANTINED; no alert was created from an incomplete write. After FerretDB was restarted, **Data operations > Reconciliation > Retry quarantined** returned them to PENDING, the worker stored all 7 (CONSISTENT), and exactly 3 alerts (critical, high, medium) and 2 simulated notifications (critical and high) were created, with evidence count 1 each.

**Visual review.** Every screen was screenshotted at 1440 x 900 and reviewed; issues found and fixed: clipped drawer tab, severity and alert state sharing one look, a stepper connector implying progress, a misleading note hint, and a house with an open medium alert counted as "all clear". Tablet width (820 px) was captured. Safari, Edge and real mobile devices were not tested.

**Not verified here:** Docker Compose startup, real MongoDB TTL index creation, Google Fonts and OpenStreetMap tiles (no internet in the sandbox; fallbacks were seen), and anything on AWS.
