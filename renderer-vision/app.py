"""
ViralTrim Vision Service
------------------------
Google Cloud Run microservice for visual segmentation and active speaker tracking.
Uses MediaPipe Face Detection to find the X-coordinate of the subject for 9:16 auto-cropping.

POST /track
  Body: { "url": "video source url", "startSec": 10, "endSec": 15 }
  Returns: { "success": true, "crop_center_x": 0.5 }
"""

import os
import tempfile
import subprocess
import cv2
import mediapipe as mp
import threading
from flask import Flask, request, jsonify

app = Flask(__name__)

INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

mp_face_detection = mp.solutions.face_detection

def verify_internal_secret(req) -> bool:
    if not INTERNAL_SECRET:
        return True
    provided = req.headers.get("X-Internal-Secret", "")
    return provided == INTERNAL_SECRET

def process_video_segment(video_path):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Failed to open video file")
        
    total_x = 0
    valid_frames = 0
    
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Process every 5th frame for speed
            if int(cap.get(cv2.CAP_PROP_POS_FRAMES)) % 5 != 0:
                continue
                
            # MediaPipe expects RGB
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_detection.process(image)
            
            if results.detections:
                # Get the most prominent face center X relative
                face = results.detections[0]
                box = face.location_data.relative_bounding_box
                center_x = box.xmin + (box.width / 2)
                total_x += center_x
                valid_frames += 1
                
    cap.release()
    if valid_frames == 0:
        return 0.5 # Default to center if no face identified
    return total_x / valid_frames


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "viraltrim-vision"})

@app.route("/track", methods=["POST"])
def track():
    if not verify_internal_secret(request):
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    url = data.get("url")
    start = data.get("startSec", 0)
    end = data.get("endSec", 0)
    
    if not url or end <= start:
        return jsonify({"error": "Valid URL and timestamps required"}), 400

    video_path = None
    try:
        # Download strictly only the selected segment to save compute
        fd, video_path = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        
        duration = end - start
        
        # yt-dlp to grab just a small clip
        download_cmd = [
            "yt-dlp",
            "-S", "res:720", # Restrict resolution for fast processing
            "--external-downloader", "ffmpeg",
            "--external-downloader-args", f"ffmpeg_i:-ss {start} -t {duration}",
            "-o", video_path,
            "--quiet",
            url
        ]
        
        result = subprocess.run(download_cmd, capture_output=True, timeout=120)
        if result.returncode != 0:
            return jsonify({"error": "Video download for vision tracking failed"}), 500
            
        crop_x = process_video_segment(video_path)
        
        return jsonify({
            "success": True,
            "crop_center_x": round(crop_x, 3)
        })
        
    except Exception as e:
        print(f"[vision] Error: {e}")
        return jsonify({"error": str(e)}), 500
        
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except:
                pass

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
