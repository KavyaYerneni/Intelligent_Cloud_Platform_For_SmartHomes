"""Classify one or more WAV files from the command line (no server needed).

  python ml/predict.py ~/Downloads/1-137-A.wav
  python ml/predict.py ~/Downloads/dataset/files/*.wav
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.audio import AudioError, decode_wav  # noqa: E402
from app.embedder import build_embedder  # noqa: E402
from app.registry import Registry  # noqa: E402


def main(paths: list[str]) -> None:
    if not paths:
        sys.exit(__doc__)
    registry = Registry(Path(__file__).resolve().parent / "models")
    registry.discover_and_load()
    model = registry.get("human-sounds", "1.0.0")
    if model is None or not model.loaded:
        sys.exit(f"Model not available: {model.load_error if model else 'not found'}")
    embedder = build_embedder("yamnet", "https://tfhub.dev/google/yamnet/1", "production")
    classes = model.manifest["classes"]
    for p in paths:
        try:
            clip = decode_wav(Path(p).read_bytes(), max_bytes=50 * 1024 * 1024, min_seconds=0.5, max_seconds=60)
        except (OSError, AudioError) as exc:
            print(f"{p}: skipped ({exc})")
            continue
        embedding, info = embedder.embed(clip.waveform)
        probs = model.predict(np.asarray(embedding, dtype=np.float32))
        top = np.argsort(probs)[::-1][:3]
        guesses = ", ".join(f"{classes[i]} {probs[i]:.0%}" for i in top)
        audioset = ", ".join(x["label"] for x in info.get("audioSetTop", []))
        print(f"{Path(p).name}: {guesses}" + (f"   [YAMNet AudioSet: {audioset}]" if audioset else ""))


if __name__ == "__main__":
    main(sys.argv[1:])
