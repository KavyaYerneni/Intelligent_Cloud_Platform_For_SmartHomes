from app import main
from tests.conftest import wav_bytes

Q = {"model": "human-sounds", "version": "1.0.0"}


def test_health_reports_test_embedder(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["embedder"]["kind"] == "test" and body["embedder"]["testOnly"] is True
    assert body["models"] == [{"name": "human-sounds", "version": "1.0.0", "loaded": True, "error": None}]


def test_models_listing_has_provenance_and_caveat(client):
    item = client.get("/models").json()["items"][0]
    assert item["sha256Verified"] and item["backbone"]["name"] == "YAMNet"
    assert "upper bound" in item["reportedMetrics"]["caveat"]


def test_classify_contract(client):
    r = client.post("/classify", params=Q, content=wav_bytes(seconds=5), headers={"Content-Type": "audio/wav"})
    assert r.status_code == 200, r.text
    body = r.json()
    probs = body["probabilities"]
    assert len(probs) == 10 and abs(sum(p["probability"] for p in probs) - 1) < 1e-3
    assert probs == sorted(probs, key=lambda p: -p["probability"])
    assert body["label"] == probs[0]["label"] and body["confidence"] == probs[0]["probability"]
    assert body["model"]["sha256"].startswith("f067c9c6")
    assert body["audio"]["sampleRate"] == 44100 and body["audio"]["durationSeconds"] == 5.0
    assert body["embedder"]["testOnly"] is True and body["latencyMs"] >= 0


def test_same_audio_same_result(client):
    raw = wav_bytes(seconds=3, freq=300)
    a = client.post("/classify", params=Q, content=raw).json()
    b = client.post("/classify", params=Q, content=raw).json()
    assert a["probabilities"] == b["probabilities"]


def test_errors(client):
    assert client.post("/classify", params=Q, content=b"not audio").json()["code"] == "NOT_WAV"
    r = client.post("/classify", params={"model": "x", "version": "9"}, content=wav_bytes())
    assert r.status_code == 404 and r.json()["code"] == "MODEL_NOT_FOUND"
    assert client.post("/classify", content=wav_bytes()).status_code == 422  # model/version required
    main.state.settings.max_bytes = 100
    r = client.post("/classify", params=Q, content=wav_bytes())
    assert r.status_code == 413 and r.json()["code"] == "AUDIO_TOO_LARGE"


def test_embedder_unavailable_is_503(client):
    main.state.embedder, main.state.embedder_error = None, "download failed"
    r = client.post("/classify", params=Q, content=wav_bytes())
    assert r.status_code == 503 and r.json()["code"] == "EMBEDDER_UNAVAILABLE"
    assert client.get("/health").json()["status"] == "degraded"


def test_service_token(client):
    main.state.settings.token = "s3cret"
    assert client.get("/models").status_code == 401
    assert client.get("/models", headers={"X-Service-Token": "s3cret"}).status_code == 200
