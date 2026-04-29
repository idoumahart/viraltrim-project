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
PROXY_URL = os.environ.get("VT_WEBSHARE_PROXY_URL") or os.environ.get("WEBSHARE_PROXY_URL", "")
_WEBSHARE_PROXY_URLS = os.environ.get("WEBSHARE_PROXY_URLS", "")
PROXY_LIST = [p.strip() for p in _WEBSHARE_PROXY_URLS.split(",") if p.strip()] if _WEBSHARE_PROXY_URLS else ([PROXY_URL] if PROXY_URL else [])
_proxy_index = 0

def get_proxy():
    global _proxy_index
    if not PROXY_LIST:
        return None
    proxy = PROXY_LIST[_proxy_index % len(PROXY_LIST)]
    _proxy_index += 1
    return proxy

mp_face_detection = mp.solutions.face_detection

def verify_internal_secret(req) -> bool:
    if not INTERNAL_SECRET:
        if os.environ.get("ENV", "dev") == "production":
            raise RuntimeError("INTERNAL_SECRET is required in production")
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
    start = data.get("start_time", data.get("startSec", 0))
    end = data.get("end_time", data.get("endSec", 0))
    stream_url = data.get("stream_url")
    
    if not url or end <= start:
        return jsonify({"error": "Valid URL and timestamps required"}), 400

    video_path = None
    try:
        fd, video_path = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        
        duration = end - start
        print(f"[vision] Tracking face in {url} ({start}s - {end}s)")
        
        if stream_url:
            # Direct stream URL from Worker — extract just the segment with ffmpeg.
            # ffmpeg handles HTTP range requests so it doesn't download the full video.
            print(f"[vision] Extracting segment from stream URL: {stream_url[:80]}...")
            trim_cmd = [
                "ffmpeg", "-y",
                "-ss", str(start),
                "-i", stream_url,
                "-t", str(duration),
                "-c", "copy",
                "-avoid_negative_ts", "make_zero",
                video_path
            ]
            print(f"[vision] FFmpeg: {' '.join(trim_cmd)}")
            result = subprocess.run(trim_cmd, capture_output=True, timeout=120)
            if result.returncode != 0:
                stderr = result.stderr.decode('utf-8', errors='replace')[:500]
                print(f"[vision] FFmpeg segment extract failed: {stderr}")
                stream_url = None  # trigger fallback
            else:
                print(f"[vision] Segment extract complete: {os.path.getsize(video_path)} bytes")
        
        if not stream_url:
            # yt-dlp fallback
            download_cmd = [
                "yt-dlp",
                "-S", "res:720",
                "--download-sections", f"*{start}-{end}",
                "--force-keyframes-at-cuts",
                "-o", video_path,
                "--quiet",
                "--no-playlist",
                "--remote-components", "ejs:github",
                "--no-check-certificates",
            ]
            
            proxy = get_proxy()
            if proxy:
                download_cmd.extend(["--proxy", proxy])
                
            download_cmd.append(url)
            
            print(f"[vision] Running yt-dlp: {' '.join(download_cmd)}")
            result = subprocess.run(download_cmd, capture_output=True, timeout=120)
            if result.returncode != 0:
                stderr = result.stderr.decode('utf-8', errors='replace')[:1000]
                print(f"[vision] yt-dlp failed (exit={result.returncode}): {stderr}")
                return jsonify({"error": f"Video download failed: {stderr}"}), 500
            
            if not os.path.exists(video_path) or os.path.getsize(video_path) == 0:
                print(f"[vision] Downloaded file empty or missing: {video_path}")
                return jsonify({"error": "Downloaded video file is empty"}), 500
            print(f"[vision] Download complete: {os.path.getsize(video_path)} bytes")
            
        crop_x = process_video_segment(video_path)
        print(f"[vision] Face center detected at x={round(crop_x, 3)}")
        
        return jsonify({
            "success": True,
            "crop_center_x": round(crop_x, 3)
        })
        
    except Exception as e:
        print(f"[vision] Unhandled error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
        
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except Exception as e:
                print(f"[vision] Failed to remove temp file: {e}")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
