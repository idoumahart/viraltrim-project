FROM python:3.11-slim

# Build-time optimization: Install FFmpeg and system dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the server application
COPY app.py .

# Expose port for Cloud Run
EXPOSE 8080

# Configure Gunicorn for high-throughput rendering
# Increased timeout to 600s for large clip renders
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--timeout", "600", "--workers", "1", "--threads", "4", "app:app"]

