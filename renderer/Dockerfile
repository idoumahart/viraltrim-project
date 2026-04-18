FROM python:3.11-slim

# Install FFmpeg, curl, unzip (needed for Deno install)
RUN apt-get update && \
    apt-get install -y ffmpeg curl unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Deno (JS runtime required by yt-dlp for YouTube extraction)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL=/root/.deno
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Set up working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Always pull the latest yt-dlp to ensure YouTube bot-bypass patches are current
RUN pip install --upgrade yt-dlp

# Copy the server application
COPY app.py .

# Expose port for Cloud Run
EXPOSE 8080

# Configure Gunicorn for high-throughput rendering
# Increased timeout to 600s for large clip renders
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "600", "--workers", "1", "--threads", "4", "app:app"]

