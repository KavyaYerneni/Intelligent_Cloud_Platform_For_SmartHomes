# AI component: trained audio model in the live pipeline

The professor's rubric says: "For an AI component, provide UI, model management, and deployment." This is that component. It belongs to **Alert tracking (Kavya)**, whose design includes the "classifier adapter" (C3 §2.2), with the data side (model provenance in MongoDB) in **Srija's** component. The team should confirm this ownership split (DECISIONS 22).

## What it does

A microphone sends a short WAV clip. The team's trained model names the sound, the platform turns the name into an event, and the existing alert rules decide whether that event raises an alert. The alert then appears live on the dashboard, exactly like any other.

```
microphone / simulator / audio agent
        │  POST /api/v1/devices/{id}/audio   (WAV, device credential)
        ▼
Node API  backend/ai.js ── checks device, house, role; picks this tenant's model
        │  POST /classify   (internal only)
        ▼
inference service  ml/   WAV → 16 kHz mono → YAMNet embeddings (1024 per frame)
        │                → average → team classifier (Dense 512-256-10) → 10 probabilities
        ▼
backend/ai.js  label → event type (domain.AI_LABEL_MAP)
        │  storeEvent(): same idempotent path as POST /events, source "model"
        ▼
worker  ALERT_RULES (confidence thresholds) → alert, live update, MongoDB ai_results
```

| Model label | Event type | Alert |
|---|---|---|
| Baby cry, infant cry | human help sound | High at 85% confidence or more |
| Cough, Breathing | unusual sound | Medium at 75%, high at 90% |
| Sneeze, Brushing teeth, Clapping, Laughter, Pouring water, Snoring, Walk/footsteps | normal activity sound | Never |

Only the server's inference path can create `source: "model"` events. `POST /events` refuses that source from devices and users, so anything the UI calls "AI model" really came from the model.

## Files

| Path | Purpose |
|---|---|
| `ml/app/audio.py` | WAV decoding and validation. Preprocessing copies `Human_model.ipynb` exactly (int16 ÷ 32767, FFT resample to 16 kHz), so live features match training. |
| `ml/app/embedder.py` | YAMNet loader (TF Hub). A test embedder exists only for tests and is refused unless `ML_ENV=test`. |
| `ml/app/registry.py` | Model registry: reads `models/<name>/<version>/manifest.json`, verifies SHA-256, loads Keras in safe mode, attaches `evaluation.json`. |
| `ml/app/main.py` | Internal HTTP API: `/health`, `/models`, `/classify`. |
| `ml/models/human-sounds/1.0.0/` | The team's `.keras` model and its manifest (provenance, training details, reported metrics with caveat). |
| `ml/evaluate.py`, `ml/predict.py` | Held-out evaluation and a command-line classifier, run where the dataset is. |
| `ml/Dockerfile` | Deployment image; caches YAMNet at build time. |
| `backend/ai.js`, `backend/ml.js` | Adapter, model management, test console, statistics; HTTP client to the service. |
| `backend/migrations/003_ai_inference.sql` | Per-tenant model settings and the inference log. |
| `frontend/views/ai/` | AI models page. |
| `scripts/audio-agent.mjs` | Replays a folder of WAV files as a live microphone. |

## Run it on your Mac

**With Docker (recommended).** `docker compose up --build -d` now also builds the `ml` service. The first build downloads TensorFlow and YAMNet: allow 5 to 15 minutes and about 2 GB. Then `docker compose ps` should show `ml` as healthy. Give Docker Desktop at least 4 GB of memory (Settings > Resources).

**Without Docker, for development:**

```bash
cd ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-tools.txt         # TensorFlow, YAMNet loader, test tools
uvicorn app.main:app --port 8000              # first start downloads YAMNet once
```

Then run the Node API as usual (`npm run server`); `.env` points it at `http://127.0.0.1:8000`.

**Classify your sample clip without the platform:**

```bash
python ml/predict.py ~/Downloads/1-137-A.wav
```

## Live monitoring from your dataset

The 20 GB dataset stays on your Mac. The agent reads it locally and streams clips to the API one at a time, sending heartbeats so the device stays online:

```bash
npm run audio-agent -- --dir ~/Downloads/YOUR_DATASET_FOLDER --device D001 --interval 5 --shuffle --loop
```

Each line shows what the model heard and whether an alert will be raised. The overview, alerts and AI models pages update live. Stop with Ctrl+C for a summary. For a real device credential instead of the technician sign-in: Houses & devices > device > Access > Issue new credential, then add `--credential <value>`.

You can also send clips from the browser: **Simulator > Recorded audio**, choose WAV files, **Send to the model**.

## How good is the model? (be ready for this question)

The notebook reports **91% accuracy**. That number is optimistic:

- `cleaned_file2.xlsx` has 688 rows but only **385 unique recordings**; 303 rows are exact duplicates.
- The 70/30 split was over rows, so many test rows had an identical copy in training.
- 17 of the 18 clips in the old demo folder are training files, so getting them right shows little.
- Even with that, **Cough recall is 0.45** and **Sneeze precision is 0.58**: coughs are often heard as sneezes.

For an honest number, run the evaluation on recordings the model never saw:

```bash
python ml/evaluate.py --audio-dir ~/Downloads/YOUR_DATASET_FOLDER/files \
  --labels ~/Downloads/YOUR_DATASET_FOLDER/labels.xlsx \
  --exclude ml/training-recordings.txt --dataset-name "Group 4 dataset, held out"
```

It writes `ml/models/human-sounds/1.0.0/evaluation.json`; restart the `ml` service (or rebuild the image) and the model card shows the measured result next to the reported one. Column names default to `recording` and `ground_truth`; change them with `--file-column` and `--label-column`.

## Model management (AI models page)

- **Live monitoring:** what the model heard in the last 24 hours, recent inferences linked to their events, latency, alerts raised.
- **Model card:** provenance, architecture, YAMNet backbone, training data and split, SHA-256 (verified at load), reported and measured metrics, weak classes flagged.
- **Enable or disable** (operator only, per community, audited): disabled means microphone clips get `409 MODEL_DISABLED` and no events.
- **Try the model:** classify a clip from your computer; shows all 10 probabilities and YAMNet's own AudioSet guess for context. Creates no events.
- **Label to alert mapping:** the table above.

New model versions: put `model.keras` and a `manifest.json` (with its SHA-256) in `ml/models/human-sounds/<version>/` and rebuild. The service loads every registered version; the newest is used unless an operator pins one. Uploading model files through the web UI is intentionally not offered, because a model file is code-like and should go through review and deployment.

## Failure behaviour

| Situation | Result |
|---|---|
| Inference service down or slow | `503 AI_UNAVAILABLE` / `AI_TIMEOUT`; no event; logged as FAILED. The device keeps the clip and retries with the same `X-Event-Id`. |
| Not a WAV, too short or long, bad rate | `400` with the service's code (for example `NOT_WAV`, `AUDIO_TOO_SHORT`); logged as REJECTED. |
| Retry of an accepted clip | `200 replayed`; no second inference, event or alert. |
| Model file changed on disk | Checksum mismatch: the version is not loaded and the model card says why. |
| Model disabled | `409 MODEL_DISABLED`. |

The design (C3 §2.2) says a classifier timeout should produce an UNKNOWN label. Because audio is not stored, accepting an UNKNOWN event would lose the evidence, so the platform refuses and the device retries instead (DECISIONS 19).

## Tests

```bash
cd ml && python -m pytest -q                     # 23 tests: audio, registry, checksum, HTTP contract
npm test                                         # unit: label map equals model classes, provenance
npm run test:integration                         # tests/integration/ai.test.js: 6 tests on real databases
npm run test:ui                                  # tests/ui/ai.test.jsx
npm run test:e2e                                 # tests/e2e/ai.spec.js with the real service running
```

The integration tests replace the inference service with a fake that follows the same HTTP contract, so they can choose the label, simulate an outage and check every path. `ml/tests/test_api.py` checks the real service against that contract.

## Demo script

1. **AI models > Model card.** Show provenance, checksum verified, the architecture, and both metric tables. Say the 91% is an upper bound and why; show your held-out evaluation if you ran it.
2. **Try the model** with `1-137-A.wav` (not in the training list). Show the probabilities and YAMNet's own guess.
3. **Label to alert mapping.** Explain that the model names the sound and the rules decide the alert.
4. In a terminal, start the audio agent on your dataset folder. Switch to **Overview**: activity appears live; when a crying or coughing clip is confident enough, an alert appears without reloading.
5. Open the alert: the explanation names the model, what it heard and its confidence. Open **Stored record**: model version, checksum and probabilities are stored with the event.
6. **Model card > Disable audio inference.** The agent's next clips are refused with "model disabled". Enable it again.
7. Stop the service (`docker compose stop ml`): clips get 503, the AI models page says the service is unreachable, the rest of the platform keeps working. `docker compose start ml` and the agent's retries succeed.

## Recording checklist

- [ ] Show the model card and say plainly that the 91% figure has a duplicate-row caveat.
- [ ] Classify a clip that is not in `ml/training-recordings.txt`.
- [ ] Show one clip going all the way to an alert and its stored provenance.
- [ ] Show disable/enable and the audit entry in Data operations > Audit log.
- [ ] Show the outage and recovery.
- [ ] Never show a result with the red "test embedder" warning as a real prediction.

## Likely questions

*Did you train YAMNet?* No. YAMNet is Google's pretrained AudioSet model used as a feature extractor; the team trained the small classifier on its embeddings (transfer learning).

*Why average the frame embeddings?* The classifier needs one fixed-size vector per clip; averaging the 0.48-second frames is what the notebook did, so the service does the same.

*Why not let the model raise alerts directly?* The model only names the sound. Keeping thresholds in the alert rules lets the team tune sensitivity without retraining, and the same rules apply to every event source.

*What does the appliance notebook add?* It trains a second classifier (12 appliance sounds), but no trained model file was provided, and its evaluation includes test data in training (resampling happens before the split), so it is not deployed.
