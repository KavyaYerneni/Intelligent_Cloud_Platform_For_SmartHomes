"""WAV decoding and validation.

Preprocessing deliberately mirrors Programs/Human_model.ipynb, because the
classifier was trained on features produced that way:
  - 16-bit samples are divided by 32767 (tf.int16.max), not 32768;
  - audio is resampled to 16 kHz with scipy.signal.resample (FFT based).
Additions for safety on live input: stereo is averaged to mono, other PCM
widths and float WAVs are scaled to [-1, 1], and size/duration/rate limits
reject anything that is not a short audio clip.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import scipy.signal
from scipy.io import wavfile

TARGET_RATE = 16000
MIN_RATE, MAX_RATE = 8000, 96000


class AudioError(ValueError):
    """Invalid input. `code` is returned to the caller as the error code."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class Clip:
    waveform: np.ndarray  # float32, mono, 16 kHz, in [-1, 1]
    original_rate: int
    channels: int
    duration_seconds: float
    peak: float
    rms: float

    def describe(self) -> dict:
        return {
            "sampleRate": self.original_rate,
            "channels": self.channels,
            "durationSeconds": round(self.duration_seconds, 3),
            "resampledTo": TARGET_RATE,
            "peak": round(self.peak, 4),
            "rms": round(self.rms, 4),
            "silent": self.peak < 1e-3,
        }


def _to_float(data: np.ndarray) -> np.ndarray:
    if data.dtype == np.int16:
        return data.astype(np.float64) / 32767.0  # matches training (tf.int16.max)
    if data.dtype == np.int32:
        # 24-bit WAVs are returned by scipy as int32 with the low byte padded.
        return data.astype(np.float64) / 2147483647.0
    if data.dtype == np.uint8:
        return (data.astype(np.float64) - 128.0) / 128.0
    if data.dtype in (np.float32, np.float64):
        return np.clip(data.astype(np.float64), -1.0, 1.0)
    raise AudioError("UNSUPPORTED_FORMAT", f"Unsupported WAV sample type {data.dtype}.")


def decode_wav(raw: bytes, *, max_bytes: int, min_seconds: float, max_seconds: float) -> Clip:
    if not raw:
        raise AudioError("EMPTY_AUDIO", "The request body is empty. Send a WAV file.")
    if len(raw) > max_bytes:
        raise AudioError("AUDIO_TOO_LARGE", f"Audio is {len(raw)} bytes; the limit is {max_bytes}.")
    if raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise AudioError("NOT_WAV", "Only WAV audio is accepted (RIFF/WAVE header not found).")
    try:
        rate, data = wavfile.read(io.BytesIO(raw))
    except Exception as exc:  # scipy raises ValueError for many malformed files
        raise AudioError("INVALID_WAV", f"The WAV file could not be decoded: {exc}") from None
    if not (MIN_RATE <= rate <= MAX_RATE):
        raise AudioError("BAD_SAMPLE_RATE", f"Sample rate {rate} Hz is outside {MIN_RATE}-{MAX_RATE} Hz.")
    channels = 1 if data.ndim == 1 else data.shape[1]
    if data.ndim == 2:
        data = _to_float(data).mean(axis=1)
    else:
        data = _to_float(data)
    if data.size == 0:
        raise AudioError("EMPTY_AUDIO", "The WAV file contains no samples.")
    if not np.all(np.isfinite(data)):
        raise AudioError("INVALID_WAV", "The WAV file contains NaN or infinite samples.")
    duration = data.size / rate
    if duration < min_seconds:
        raise AudioError("AUDIO_TOO_SHORT", f"Clip is {duration:.2f} s; at least {min_seconds} s is needed.")
    if duration > max_seconds:
        raise AudioError("AUDIO_TOO_LONG", f"Clip is {duration:.2f} s; send clips of at most {max_seconds} s.")
    if rate != TARGET_RATE:
        data = scipy.signal.resample(data, int(round(data.size / rate * TARGET_RATE)))
    wave = data.astype(np.float32)
    return Clip(wave, rate, channels, duration, float(np.max(np.abs(wave))), float(np.sqrt(np.mean(wave ** 2))))
