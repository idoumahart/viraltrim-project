FROM python:3.11-slim

# Install system dependencies needed for ffmpeg, OpenCV, and Deno
RUN apt-get update && \
    apt-get install -y ffmpeg libsm6 libxext6 libgl1 curl unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (JS runtime required by yt-dlp for YouTube extraction)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL=/root/.deno
ENV PATH="$DENO_INSTALL/bin:$PATH"

WORKDIR /app

# Copy requirements & install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Always pull the latest yt-dlp to ensure YouTube bot-bypass patches are current
RUN pip install --upgrade yt-dlp

# Copy service code
COPY app.py .

# Expose port and run gunicorn
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "app:app"]
