# Audio inference service: YAMNet backbone + the team's Keras classifier.
# Works on Intel and Apple Silicon (TensorFlow ships linux/arm64 wheels).
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TF_CPP_MIN_LOG_LEVEL=2 \
    TFHUB_CACHE_DIR=/opt/tfhub MODEL_DIR=/app/models
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Download YAMNet once at build time so the container needs no internet at runtime.
# Override with --build-arg YAMNET_HANDLE=... (or set YAMNET_HANDLE to a local copy).
ARG YAMNET_HANDLE=https://tfhub.dev/google/yamnet/1
ENV YAMNET_HANDLE=${YAMNET_HANDLE}
RUN python -c "import os, tensorflow_hub as hub; hub.load(os.environ['YAMNET_HANDLE']); print('YAMNet cached')"
COPY app ./app
COPY models ./models
COPY evaluate.py predict.py ./
RUN useradd --create-home --uid 10001 ml && chown -R ml /app /opt/tfhub
USER ml
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
