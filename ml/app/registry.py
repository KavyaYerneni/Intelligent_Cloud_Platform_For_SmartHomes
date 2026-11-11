"""Model registry: discovers models/<name>/<version>/manifest.json, verifies
the artifact's SHA-256 against the manifest before loading, and loads the
Keras classifier with safe_mode (no arbitrary code in the model file runs).

An optional evaluation.json next to the manifest (written by evaluate.py) is
included in the listing so the UI can show measured metrics.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class RegisteredModel:
    manifest: dict
    directory: Path
    sha256_actual: str = ""
    classifier: object = None
    load_error: str | None = None
    evaluation: dict | None = None
    _input_size: int = field(default=1024)

    @property
    def key(self) -> tuple[str, str]:
        return self.manifest["name"], self.manifest["version"]

    @property
    def loaded(self) -> bool:
        return self.classifier is not None

    def load(self) -> None:
        artifact = self.directory / self.manifest["file"]
        if not artifact.exists():
            self.load_error = f"Model file {artifact.name} is missing."
            return
        self.sha256_actual = sha256_file(artifact)
        if self.sha256_actual != self.manifest["sha256"]:
            self.load_error = "SHA-256 of the model file does not match the manifest; refusing to load."
            return
        try:
            import keras

            model = keras.models.load_model(artifact, compile=False, safe_mode=True)
        except Exception as exc:  # report, don't crash the service
            self.load_error = f"Keras could not load the model: {exc}"
            return
        outputs = int(model.output_shape[-1])
        if outputs != len(self.manifest["classes"]):
            self.load_error = f"Model has {outputs} outputs but the manifest lists {len(self.manifest['classes'])} classes."
            return
        self._input_size = int(model.input_shape[-1])
        self.classifier = model
        evaluation = self.directory / "evaluation.json"
        if evaluation.exists():
            self.evaluation = json.loads(evaluation.read_text())

    def predict(self, embedding: np.ndarray) -> np.ndarray:
        if embedding.shape != (self._input_size,):
            raise ValueError(f"Embedding has shape {embedding.shape}, expected ({self._input_size},).")
        probs = self.classifier(embedding[np.newaxis, :].astype(np.float32), training=False)
        return np.asarray(probs)[0]

    def describe(self) -> dict:
        return {
            **self.manifest,
            "loaded": self.loaded,
            "loadError": self.load_error,
            "sha256Verified": self.sha256_actual == self.manifest["sha256"],
            "evaluation": self.evaluation,
        }


class Registry:
    def __init__(self, root: Path):
        self.root = root
        self.models: dict[tuple[str, str], RegisteredModel] = {}

    def discover_and_load(self) -> None:
        for manifest_path in sorted(self.root.glob("*/*/manifest.json")):
            manifest = json.loads(manifest_path.read_text())
            model = RegisteredModel(manifest, manifest_path.parent)
            model.load()
            self.models[model.key] = model

    def get(self, name: str, version: str) -> RegisteredModel | None:
        return self.models.get((name, version))

    def describe(self) -> list[dict]:
        return [m.describe() for m in self.models.values()]
