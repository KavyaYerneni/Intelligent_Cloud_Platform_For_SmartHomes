import io
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pytest
from scipy.io import wavfile

ML = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML))


def wav_bytes(seconds=2.0, rate=44100, channels=1, dtype=np.int16, freq=440.0, amplitude=0.5):
    t = np.arange(int(seconds * rate)) / rate
    tone = amplitude * np.sin(2 * np.pi * freq * t)
    if dtype == np.int16:
        data = (tone * 32767).astype(np.int16)
    elif dtype == np.uint8:
        data = (tone * 127 + 128).astype(np.uint8)
    else:
        data = tone.astype(dtype)
    if channels == 2:
        data = np.stack([data, data], axis=1)
    buf = io.BytesIO()
    wavfile.write(buf, rate, data)
    return buf.getvalue()


@pytest.fixture
def models_copy(tmp_path):
    """A private copy of the models directory that a test may modify."""
    dst = tmp_path / "models"
    shutil.copytree(ML / "models", dst)
    return dst


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main
    from app.embedder import TestEmbedder

    monkeypatch.setenv("ML_ENV", "test")
    main.init(main.Settings(), embedder=TestEmbedder())
    with TestClient(main.app) as c:
        yield c


def manifest(models_dir):
    path = models_dir / "human-sounds" / "1.0.0" / "manifest.json"
    return path, json.loads(path.read_text())
