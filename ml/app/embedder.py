"""Audio embedders.

YamnetEmbedder is the real backbone: Google's YAMNet (AudioSet) loaded with
tensorflow_hub. It is downloaded once (the Docker image does this at build
time) and cached in TFHUB_CACHE_DIR; YAMNET_HANDLE may also point at a local
copy for offline use.

TestEmbedder exists only so the service's plumbing can be tested where YAMNet
cannot be downloaded. It turns audio into a deterministic pseudo-embedding;
its predictions are meaningless. It is refused unless ML_ENV=test, and every
response and /health report it so the UI can show a warning.
"""
from __future__ import annotations

import hashlib
import time

import numpy as np


class Embedder:
    kind = "abstract"
    handle = ""

    def embed(self, waveform: np.ndarray) -> tuple[np.ndarray, dict]:
        raise NotImplementedError

    def describe(self) -> dict:
        return {"kind": self.kind, "handle": self.handle}


class YamnetEmbedder(Embedder):
    kind = "yamnet"

    def __init__(self, handle: str):
        import tensorflow_hub as hub  # imported lazily: slow, and absent in some test setups

        self.handle = handle
        started = time.perf_counter()
        self._model = hub.load(handle)
        self.load_seconds = round(time.perf_counter() - started, 2)
        self._class_names = self._load_class_names()

    def _load_class_names(self) -> list[str]:
        import csv

        import tensorflow as tf

        try:
            path = self._model.class_map_path().numpy().decode()
            with tf.io.gfile.GFile(path) as fh:
                return [row["display_name"] for row in csv.DictReader(fh)]
        except Exception:
            return []

    def embed(self, waveform):
        scores, embeddings, _ = self._model(waveform)
        mean_embedding = np.mean(embeddings.numpy(), axis=0)
        info = {"frames": int(embeddings.shape[0])}
        # YAMNet's own AudioSet guess, shown only as context next to the
        # team's classifier. It is never used to decide alerts.
        if self._class_names:
            mean_scores = np.mean(scores.numpy(), axis=0)
            top = np.argsort(mean_scores)[::-1][:3]
            info["audioSetTop"] = [
                {"label": self._class_names[i], "score": round(float(mean_scores[i]), 4)} for i in top
            ]
        return mean_embedding, info

    def describe(self):
        return {**super().describe(), "loadSeconds": self.load_seconds}


class TestEmbedder(Embedder):
    kind = "test"
    handle = "deterministic pseudo-embedding (TEST ONLY, predictions are meaningless)"

    def embed(self, waveform):
        seed = int.from_bytes(hashlib.sha256(waveform.tobytes()).digest()[:8], "little")
        vec = np.random.default_rng(seed).normal(0.0, 0.6, 1024).astype(np.float32)
        return vec, {"frames": max(1, int(len(waveform) / 7680))}


def build_embedder(kind: str, handle: str, env: str) -> Embedder:
    if kind == "test":
        if env != "test":
            raise RuntimeError("EMBEDDER=test is only allowed with ML_ENV=test.")
        return TestEmbedder()
    if kind == "yamnet":
        return YamnetEmbedder(handle)
    raise RuntimeError(f"Unknown EMBEDDER '{kind}'. Use 'yamnet'.")
