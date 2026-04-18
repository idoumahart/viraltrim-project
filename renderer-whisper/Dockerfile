FROM python:3.11-slim

# Install ffmpeg (for yt-dlp audio extraction) and system deps
RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Download the Whisper model during build ----
# Set Hugging Face cache directory to a known location
ENV HF_HOME=/app/.cache/huggingface
ENV HF_HUB_CACHE=/app/.cache/huggingface/hub

# Pre-download the "small" model (float32)
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='float32')"

COPY app.py .
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8080

# start.sh now just runs gunicorn since model is baked in
CMD ["./start.sh"]
