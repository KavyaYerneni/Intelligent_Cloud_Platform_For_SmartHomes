import json

import numpy as np

from app.embedder import build_embedder
from app.registry import Registry
from tests.conftest import manifest

import pytest


def test_real_model_loads_with_verified_checksum(models_copy):
    reg = Registry(models_copy)
    reg.discover_and_load()
    m = reg.get("human-sounds", "1.0.0")
    assert m.loaded, m.load_error
    d = m.describe()
    assert d["sha256Verified"] is True and len(d["classes"]) == 10
    probs = m.predict(np.zeros(1024, dtype=np.float32))
    assert probs.shape == (10,) and abs(float(probs.sum()) - 1) < 1e-4


def test_checksum_mismatch_refuses_to_load(models_copy):
    path, data = manifest(models_copy)
    data["sha256"] = "0" * 64
    path.write_text(json.dumps(data))
    reg = Registry(models_copy)
    reg.discover_and_load()
    m = reg.get("human-sounds", "1.0.0")
    assert not m.loaded and "SHA-256" in m.load_error


def test_class_count_must_match_model_outputs(models_copy):
    path, data = manifest(models_copy)
    data["classes"] = data["classes"][:9]
    path.write_text(json.dumps(data))
    reg = Registry(models_copy)
    reg.discover_and_load()
    assert "outputs" in reg.get("human-sounds", "1.0.0").load_error


def test_evaluation_file_is_published(models_copy):
    (models_copy / "human-sounds" / "1.0.0" / "evaluation.json").write_text(json.dumps({"accuracy": 0.5}))
    reg = Registry(models_copy)
    reg.discover_and_load()
    assert reg.get("human-sounds", "1.0.0").describe()["evaluation"] == {"accuracy": 0.5}


def test_wrong_embedding_size_is_rejected(models_copy):
    reg = Registry(models_copy)
    reg.discover_and_load()
    with pytest.raises(ValueError):
        reg.get("human-sounds", "1.0.0").predict(np.zeros(512, dtype=np.float32))


def test_test_embedder_refused_outside_test_env():
    with pytest.raises(RuntimeError):
        build_embedder("test", "", "production")
