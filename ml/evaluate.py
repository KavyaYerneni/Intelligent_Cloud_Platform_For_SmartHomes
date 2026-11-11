"""Measure the classifier on labelled recordings and save evaluation.json.

Run this on the machine that has the dataset (it reads files, nothing is uploaded):

  python ml/evaluate.py --audio-dir ~/Downloads/dataset/files \
      --labels ~/Downloads/dataset/labels.xlsx \
      --exclude ml/training-recordings.txt

--labels      CSV or XLSX with a recording file name column and a label column
              (defaults: "recording" and "ground_truth", as in cleaned_file2.xlsx).
--exclude     text file of recording names to skip. ml/training-recordings.txt lists
              the 385 recordings the model was trained on, so excluding it gives an
              honest held-out estimate.
Each recording is counted once even if the label file repeats it. Labels that are
not among the model's classes are skipped and reported.

The result is written to models/<name>/<version>/evaluation.json; the service and
the AI models page show it. Uses the same preprocessing and YAMNet as the service.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.audio import AudioError, decode_wav  # noqa: E402
from app.embedder import build_embedder  # noqa: E402
from app.registry import Registry  # noqa: E402


def read_labels(path: Path, file_col: str, label_col: str) -> dict[str, str]:
    import pandas as pd

    df = pd.read_excel(path) if path.suffix.lower() in (".xlsx", ".xls") else pd.read_csv(path)
    missing = {file_col, label_col} - set(df.columns)
    if missing:
        sys.exit(f"Label file is missing columns {sorted(missing)}; found {list(df.columns)}")
    labels: dict[str, str] = {}
    for rec, label in zip(df[file_col].astype(str), df[label_col].astype(str)):
        if labels.setdefault(rec, label) != label:
            sys.exit(f"Recording {rec} has conflicting labels: {labels[rec]} and {label}")
    return labels


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audio-dir", required=True, type=Path)
    ap.add_argument("--labels", required=True, type=Path)
    ap.add_argument("--file-column", default="recording")
    ap.add_argument("--label-column", default="ground_truth")
    ap.add_argument("--exclude", type=Path, help="recordings to skip, one per line")
    ap.add_argument("--model", default="human-sounds")
    ap.add_argument("--version", default="1.0.0")
    ap.add_argument("--models-dir", type=Path, default=Path(__file__).resolve().parent / "models")
    ap.add_argument("--yamnet", default="https://tfhub.dev/google/yamnet/1")
    ap.add_argument("--limit", type=int, default=0, help="stop after N recordings (quick check)")
    ap.add_argument("--dataset-name", default="", help="free text stored with the result")
    args = ap.parse_args()

    registry = Registry(args.models_dir)
    registry.discover_and_load()
    model = registry.get(args.model, args.version)
    if model is None or not model.loaded:
        sys.exit(f"Model {args.model} {args.version} not available: {model.load_error if model else 'not found'}")
    classes = model.manifest["classes"]
    index = {c: i for i, c in enumerate(classes)}

    labels = read_labels(args.labels, args.file_column, args.label_column)
    excluded = set()
    if args.exclude:
        excluded = {line.strip() for line in args.exclude.read_text().splitlines() if line.strip()}
    items = [(r, l) for r, l in sorted(labels.items()) if r not in excluded]
    unknown_labels = sorted({l for _, l in items if l not in index})
    items = [(r, l) for r, l in items if l in index]
    if args.limit:
        items = items[: args.limit]
    if not items:
        sys.exit("No recordings left to evaluate after exclusions and label filtering.")

    embedder = build_embedder("yamnet", args.yamnet, "production")
    n = len(classes)
    confusion = np.zeros((n, n), dtype=int)
    failed: list[dict] = []
    for i, (rec, label) in enumerate(items, 1):
        path = args.audio_dir / rec
        try:
            clip = decode_wav(path.read_bytes(), max_bytes=50 * 1024 * 1024, min_seconds=0.5, max_seconds=60)
        except (OSError, AudioError) as exc:
            failed.append({"recording": rec, "error": str(exc)})
            continue
        embedding, _ = embedder.embed(clip.waveform)
        pred = int(np.argmax(model.predict(np.asarray(embedding, dtype=np.float32))))
        confusion[index[label], pred] += 1
        if i % 25 == 0:
            print(f"{i}/{len(items)} evaluated", flush=True)

    total = int(confusion.sum())
    per_class = {}
    for k, c in enumerate(classes):
        tp = confusion[k, k]
        support = int(confusion[k].sum())
        predicted = int(confusion[:, k].sum())
        precision = tp / predicted if predicted else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[c] = {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4), "support": support}
    present = [v for v in per_class.values() if v["support"]]
    result = {
        "evaluatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "dataset": args.dataset_name or str(args.audio_dir),
        "labelsFile": args.labels.name,
        "excludedTrainingRecordings": bool(args.exclude),
        "excludedCount": len(excluded),
        "recordings": total,
        "accuracy": round(float(np.trace(confusion) / total), 4) if total else None,
        "macro": {k: round(float(np.mean([v[k] for v in present])), 4) for k in ("precision", "recall", "f1")} if present else None,
        "perClass": per_class,
        "confusion": {"labels": classes, "matrix": confusion.tolist()},
        "skippedLabels": unknown_labels,
        "failedFiles": failed[:50],
        "failedCount": len(failed),
        "modelSha256": model.manifest["sha256"],
        "backbone": args.yamnet,
    }
    out = model.directory / "evaluation.json"
    out.write_text(json.dumps(result, indent=2))
    print(f"\nAccuracy {result['accuracy']} on {total} recordings ({len(failed)} failed). Saved {out}")


if __name__ == "__main__":
    main()
