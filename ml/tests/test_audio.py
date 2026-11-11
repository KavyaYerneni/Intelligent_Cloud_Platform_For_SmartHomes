import numpy as np
import pytest

from app.audio import AudioError, TARGET_RATE, decode_wav
from tests.conftest import wav_bytes

LIMITS = dict(max_bytes=6 * 1024 * 1024, min_seconds=0.5, max_seconds=30)


def test_int16_uses_training_normalisation_and_is_resampled():
    clip = decode_wav(wav_bytes(seconds=5, rate=44100, amplitude=1.0), **LIMITS)
    assert clip.original_rate == 44100 and clip.channels == 1
    assert clip.waveform.dtype == np.float32
    assert len(clip.waveform) == 5 * TARGET_RATE
    assert clip.duration_seconds == pytest.approx(5.0)
    assert clip.peak <= 1.0001  # 32767/32767 at full scale


def test_16k_input_is_not_resampled_and_matches_notebook_scaling():
    raw = wav_bytes(seconds=1, rate=16000, amplitude=0.5)
    clip = decode_wav(raw, **LIMITS)
    from scipy.io import wavfile
    import io
    _, data = wavfile.read(io.BytesIO(raw))
    np.testing.assert_allclose(clip.waveform, (data / 32767).astype(np.float32), atol=1e-7)


def test_stereo_is_averaged_to_mono():
    clip = decode_wav(wav_bytes(channels=2), **LIMITS)
    assert clip.channels == 2 and clip.waveform.ndim == 1


@pytest.mark.parametrize("dtype", [np.uint8, np.float32])
def test_other_sample_formats(dtype):
    clip = decode_wav(wav_bytes(dtype=dtype, rate=22050), **LIMITS)
    assert np.max(np.abs(clip.waveform)) <= 1.0


@pytest.mark.parametrize("raw,code", [
    (b"", "EMPTY_AUDIO"),
    (b"ID3\x03mp3 data here....", "NOT_WAV"),
    (b"RIFF\x00\x00\x00\x00WAVEgarbage", "INVALID_WAV"),
])
def test_rejects_non_audio(raw, code):
    with pytest.raises(AudioError) as e:
        decode_wav(raw, **LIMITS)
    assert e.value.code == code


def test_limits():
    with pytest.raises(AudioError) as e:
        decode_wav(wav_bytes(seconds=0.2), **LIMITS)
    assert e.value.code == "AUDIO_TOO_SHORT"
    with pytest.raises(AudioError) as e:
        decode_wav(wav_bytes(seconds=31, rate=8000), **LIMITS)
    assert e.value.code == "AUDIO_TOO_LONG"
    with pytest.raises(AudioError) as e:
        decode_wav(wav_bytes(seconds=2), max_bytes=1000, min_seconds=0.5, max_seconds=30)
    assert e.value.code == "AUDIO_TOO_LARGE"
    with pytest.raises(AudioError) as e:
        decode_wav(wav_bytes(seconds=2, rate=4000), **LIMITS)
    assert e.value.code == "BAD_SAMPLE_RATE"


def test_silence_is_flagged_not_rejected():
    clip = decode_wav(wav_bytes(amplitude=0.0), **LIMITS)
    assert clip.describe()["silent"] is True
