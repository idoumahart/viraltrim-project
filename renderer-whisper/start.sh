#!/bin/bash
# start.sh — Pre-warm the Whisper model, then start gunicorn.
# Pre-warming ensures the model is in memory BEFORE the first user request,
# eliminating the ~60s cold-start delay on the transcription endpoint.
set -e

echo "[startup] Pre-warming Whisper model (small, float32)... this takes ~60s..."
python -c "
from faster_whisper import WhisperModel
print('[startup] Downloading/loading model...')
WhisperModel('small', device='cpu', compute_type='float32')
print('[startup] Model ready and cached in memory.')
"

echo "[startup] Starting gunicorn on port 8080..."
exec gunicorn \
  --bind 0.0.0.0:8080 \
  --timeout 300 \
  --workers 1 \
  --threads 4 \
  --access-logfile - \
  --error-logfile - \
  app:app
