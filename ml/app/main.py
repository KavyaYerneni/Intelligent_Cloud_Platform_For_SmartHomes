"""Inference service for the smart-home platform (internal; not exposed publicly).

The Node API calls this service; browsers never do. Endpoints:
  GET  /health            embedder and model load state
  GET  /models            registry with provenance, reported and measured metrics
  POST /classify          body: WAV bytes; query: model, version -> label, confidence, probabilities
"""
from __future__ import annotations

import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from .audio import AudioError, decode_wav
from .embedder import Embedder, build_embedder
from .registry import Registry

log = logging.getLogger("ml")


class Settings:
    def __init__(self) -> None:
        self.env = os.environ.get("ML_ENV", "production")
        self.model_dir = Path(os.environ.get("MODEL_DIR", Path(__file__).resolve().parents[1] / "models"))
        self.embedder = os.environ.get("EMBEDDER", "yamnet")
        self.yamnet_handle = os.environ.get("YAMNET_HANDLE", "https://tfhub.dev/google/yamnet/1")
        self.max_bytes = int(os.environ.get("MAX_AUDIO_BYTES", 6 * 1024 * 1024))
        self.min_seconds = float(os.environ.get("MIN_AUDIO_SECONDS", 0.5))
        self.max_seconds = float(os.environ.get("MAX_AUDIO_SECONDS", 30))
        self.token = os.environ.get("ML_SERVICE_TOKEN", "")


class State:
    settings: Settings
    registry: Registry
    embedder: Embedder | None = None
    embedder_error: str | None = None
    started_at: float = 0.0


state = State()


def init(settings: Settings, embedder: Embedder | None = None) -> None:
    """Load models and the embedder. Tests pass a ready embedder."""
    state.settings = settings
    state.registry = Registry(settings.model_dir)
    state.registry.discover_and_load()
    state.started_at = time.time()
    if embedder is not None:
        state.embedder, state.embedder_error = embedder, None
        return
    try:
        state.embedder = build_embedder(settings.embedder, settings.yamnet_handle, settings.env)
        state.embedder_error = None
    except Exception as exc:
        state.embedder, state.embedder_error = None, f"{type(exc).__name__}: {exc}"
        log.error("embedder failed to load: %s", state.embedder_error)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not getattr(state, "registry", None):
        init(Settings())
    yield


app = FastAPI(title="Smart Home audio inference", version="1.0.0", lifespan=lifespan)


def error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    body = exc.detail if isinstance(exc.detail, dict) else {"code": "HTTP_ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=body)


def check_token(token: str | None) -> None:
    expected = state.settings.token
    if expected and not hmac.compare_digest(token or "", expected):
        raise error(401, "UNAUTHORIZED", "Missing or wrong X-Service-Token.")


def embedder_info() -> dict:
    if state.embedder is None:
        return {"kind": state.settings.embedder, "loaded": False, "error": state.embedder_error}
    return {**state.embedder.describe(), "loaded": True, "testOnly": state.embedder.kind == "test"}


@app.get("/health")
def health(x_service_token: str | None = Header(default=None)):
    check_token(x_service_token)
    models = [{"name": m.key[0], "version": m.key[1], "loaded": m.loaded, "error": m.load_error}
              for m in state.registry.models.values()]
    ready = state.embedder is not None and any(m["loaded"] for m in models)
    return {"status": "ok" if ready else "degraded", "embedder": embedder_info(), "models": models,
            "uptimeSeconds": round(time.time() - state.started_at)}


@app.get("/models")
def models(x_service_token: str | None = Header(default=None)):
    check_token(x_service_token)
    return {"embedder": embedder_info(), "items": state.registry.describe()}


@app.post("/classify")
async def classify(request: Request, model: str = Query(...), version: str = Query(...),
                   x_service_token: str | None = Header(default=None)):
    check_token(x_service_token)
    started = time.perf_counter()
    registered = state.registry.get(model, version)
    if registered is None:
        raise error(404, "MODEL_NOT_FOUND", f"No registered model {model} {version}.")
    if not registered.loaded:
        raise error(503, "MODEL_NOT_LOADED", registered.load_error or "Model is not loaded.")
    if state.embedder is None:
        raise error(503, "EMBEDDER_UNAVAILABLE", state.embedder_error or "Audio embedder is not loaded.")
    raw = await request.body()
    try:
        clip = decode_wav(raw, max_bytes=state.settings.max_bytes,
                          min_seconds=state.settings.min_seconds, max_seconds=state.settings.max_seconds)
    except AudioError as exc:
        raise error(413 if exc.code == "AUDIO_TOO_LARGE" else 400, exc.code, exc.message) from None
    embedding, embed_info = state.embedder.embed(clip.waveform)
    probs = registered.predict(np.asarray(embedding, dtype=np.float32))
    classes = registered.manifest["classes"]
    order = np.argsort(probs)[::-1]
    best = int(order[0])
    return {
        "model": {"name": model, "version": version, "sha256": registered.manifest["sha256"]},
        "label": classes[best],
        "confidence": round(float(probs[best]), 4),
        "probabilities": [{"label": classes[i], "probability": round(float(probs[i]), 4)} for i in order],
        "audio": clip.describe(),
        "embedder": embedder_info(),
        "frames": embed_info.get("frames"),
        "audioSetTop": embed_info.get("audioSetTop", []),
        "latencyMs": round((time.perf_counter() - started) * 1000, 1),
    }
