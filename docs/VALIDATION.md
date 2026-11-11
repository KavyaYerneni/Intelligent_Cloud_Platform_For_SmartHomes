# Validation record

Actual results only. Re-run these on your own machine before the demo and record the outcome; a pass here is not a pass in your environment.

## Run of 2026-11-10 (sandbox, after adding the AI component)

**Environment.** Linux sandbox, Node 22.23, Python 3.13 with TensorFlow 2.20.0 / Keras 3.15.1, PostgreSQL 16, FerretDB 1.24 standing in for MongoDB (MongoDB downloads were blocked). Docker was not available, so `compose.yaml` and both Dockerfiles were **not** built. Chromium 131 via `PLAYWRIGHT_EXECUTABLE_PATH`. Fresh databases, migrations 001-003, seed.

**YAMNet could not be downloaded here** (tfhub.dev, Kaggle and Google Storage are blocked by the sandbox network policy). So:
- The team's trained classifier **was** loaded and run with real TensorFlow: SHA-256 verified, safe-mode load, 1024 inputs, 10 outputs, probabilities summing to 1.
- End-to-end runs used the service's **test embedder** (`ML_ENV=test EMBEDDER=test`), which feeds pseudo-features to the real classifier. Those predictions are meaningless; the UI and agent label them as not real. **No real prediction for `1-137-A.wav` or any clip was produced here.** Run `python ml/predict.py ~/Downloads/1-137-A.wav` on your Mac for that.
- `ml/evaluate.py` was not run (the dataset is not in the sandbox).

| Suite | Command | Result |
|---|---|---|
| Backend unit | `npm test` | 11 passed, 0 failed |
| UI unit | `npm run test:ui` | 20 passed (5 files) |
| Inference service | `cd ml && python -m pytest -q` | 23 passed |
| API + database integration | `npm run test:integration` | 14 passed, 0 failed (incl. 6 in `ai.test.js`) |
| Production build | `npm run build` | succeeded |
| Browser end-to-end | `npx playwright test` | 4 passed (2 AI, 2 existing) |

**Tests shown able to fail.** Changing the 16-bit scaling from 32767 to 32768 failed `test_16k_input_is_not_resampled_and_matches_notebook_scaling`. Marking model events as `device` initially did **not** fail the AI browser test (it opened an older event); the test was fixed to check the newest event and then failed as it should, and passes on the correct code.

**Defect found and fixed.** The API's error handler replaced every 5xx message, hiding the "retry with the same X-Event-Id" guidance from devices; deliberate errors now keep their message (DECISIONS 23).

**Failure and recovery, observed.** With the inference service stopped: audio upload returned `503 AI_UNAVAILABLE` with retry guidance, the attempt was logged as FAILED, the AI models page reported the service unreachable, and the dashboard kept working. After restart, the same `X-Event-Id` was accepted (202).

**Data findings.** `cleaned_file2.xlsx` has 688 rows but 385 unique recordings (303 duplicates), so the notebook's 91% accuracy is an upper bound. 17 of the 18 demo clips are training recordings; `1-137-A.wav` is not in the training list. Documented on the model card and in `docs/components/ai-model.md`.

**Not verified here:** Docker Compose and the `ml` image build (including the YAMNet download at build time), real YAMNet inference and its latency, TensorFlow on Apple Silicon, held-out accuracy.

Actual results only. Re-run these on your own machine before the demo and record the outcome; a pass here is not a pass in your environment.

## Earlier run of 2026-11-06 (sandbox, after the UI redesign)

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
