FROM python:3.11-slim

# Install system dependencies needed for ffmpeg and OpenCV
RUN apt-get update && \
    apt-get install -y ffmpeg libsm6 libxext6 libgl1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements & install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy service code
COPY app.py .

# Expose port and run gunicorn
EXPOSE 8080
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "0", "app:app"]
