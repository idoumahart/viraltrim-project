FROM python:3.11-slim

# Install ffmpeg, curl, unzip (needed for Deno install)
RUN apt-get update && \
    apt-get install -y ffmpeg curl unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (JS runtime required by yt-dlp for YouTube extraction)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL=/root/.deno
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Always pull the latest yt-dlp to ensure YouTube bot-bypass patches are current
RUN pip install --upgrade yt-dlp

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
