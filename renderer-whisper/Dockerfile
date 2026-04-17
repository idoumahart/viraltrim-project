FROM python:3.11-slim

# Install ffmpeg (for yt-dlp audio extraction) and system deps
RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8080

# start.sh pre-warms the Whisper model before accepting traffic
CMD ["./start.sh"]
