#!/bin/bash
# start.sh — Start gunicorn. Whisper model lazy-loads on first /transcribe request.
set -e
echo "[startup] Starting gunicorn on port 8080..."
exec gunicorn \
  --bind 0.0.0.0:8080 \
  --timeout 300 \
  --workers 1 \
  --threads 4 \
  --access-logfile - \
  --error-logfile - \
  app:app
