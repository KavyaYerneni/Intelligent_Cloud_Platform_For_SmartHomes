# Monitoring upgrade — November 11, 2026

Open http://localhost:3000 and sign in with an existing demo account and the password in `.env`. The overview now uses a horizontal navigation, restrained indigo palette, hourly sound counts, sound distribution, confidence metrics, a live prediction table, and room connection cards. The original inventory, alert lifecycle, evidence, recovery, map, and model management remain available.

## Dataset audit

The supplied `datasets` directory contains **8,051 WAV recordings**: 2,000 in Human audio, 4,498 in appliance_audio, and 1,553 in Animal Sound. Two non-audio metadata files in Animal Sound are excluded. All WAV headers were readable. The machine-readable audit is `DATASET_INVENTORY.json`.

There are 405 recordings shorter than 0.5 seconds, three longer than 30 seconds, and one larger than 6 MB. The replay tool splits every recording into chunks of at most five seconds and silence-pads chunks below 0.5 seconds. It processes the entire recording, including the final chunk. Chunk counts therefore differ from source-file counts. Failed files are recorded and can be retried on the next run.

Folder names are not reliable class labels. The Human audio directory contains sounds outside the team's ten human classes. Only recordings identified in the supplied training-recordings list use that classifier during automatic replay; other recordings use the broad YAMNet output. This is a routing decision, not a claim that predictions are correct. No new animal or appliance model has been trained. The supplied human model and its reported evaluation limitations remain documented in its manifest and model card.

YAMNet inference uses the highest mean AudioSet score across frames, following the [TensorFlow reference](https://www.tensorflow.org/hub/tutorials/yamnet). Scores are shown as confidence, not accuracy or a probability of danger. Broad alarm categories enter the existing unusual-sound review rule; other broad predictions are retained without an alert. The deterministic smoke sensor rule remains separate.

## Playback and rooms

Each of Willow, Oak, and Cedar now has Living Room, Bedroom, Bathroom, Kitchen, Utility room, and Garden: **18 rooms and 18 microphone devices**. Seeding is additive and preserves existing records. Recorded files rotate across the corresponding demo rooms; this location is simulated, not a claim about where a recording was made.

Start or resume the complete collection:

```powershell
docker compose --profile playback up -d replay
docker compose logs --tail 20 -f replay
```

Stop playback:

```powershell
docker compose stop replay
```

Progress lives in the `replay_progress` Docker volume and resumes without resending completed chunks. After the collection finishes, the service exits normally. The dashboard retains history; devices become offline after the heartbeat timeout when playback stops. All 18 replay devices send regular heartbeats while playback runs. These are simulated devices with real local inference.

For a bounded host-side demo:

```powershell
python scripts/replay-datasets.py --limit 36 --interval 1
```

The host command has a separate checkpoint at `.runtime/dataset-replay.json`. `--reset` starts a new host playback pass. Do not run host playback and Docker playback simultaneously unless duplicate demonstration activity is desired.

For individual WAV uploads, choose a house and microphone in Simulator, choose Human or General sound classifier, then upload. Uploaded recordings are marked as recorded audio in monitoring. Inference and all persistence remain local; hosting is not configured or deployed.

## Verification

- Production frontend build passed.
- 12 unit tests passed, including broad model routing and existing severity boundaries.
- 14 existing database integration tests passed; added assertions verify scoped sound labels, rooms, counts, and alert decisions. The AI integration suite additionally verifies general sound routing and recorded provenance.
- 20 existing UI tests passed in the application container.
- Real YAMNet and the supplied Keras model loaded in the inference container; a 36-recording smoke test completed with no failures.
- Full collection playback was started and observed delivering further real predictions. This is an ongoing playback run, not a completed accuracy evaluation of all files.
- Desktop and mobile layouts were visually checked. Screenshots are in `docs/screenshots/monitoring-overview.png` and `monitoring-live.png`.

The monitoring summary remains tenant/house scoped on the server. Model inference labels are joined from persistent SQL inference records even after processed event envelopes have been cleared. All chart totals are database aggregates rather than sample arrays.
