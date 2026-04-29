from flask import Flask, request, jsonify
import os
import subprocess
import tempfile
import boto3
from google.cloud import storage

app = Flask(__name__)

# Cloudflare R2 Credentials via Environment Variables
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "viraltrim-media")
WEBSHARE_PROXY_URL = os.environ.get("WEBSHARE_PROXY_URL", "")
_WEBSHARE_PROXY_URLS = os.environ.get("WEBSHARE_PROXY_URLS", "")
PROXY_LIST = [p.strip() for p in _WEBSHARE_PROXY_URLS.split(",") if p.strip()] if _WEBSHARE_PROXY_URLS else ([WEBSHARE_PROXY_URL] if WEBSHARE_PROXY_URL else [])
_proxy_index = 0

def get_proxy():
    global _proxy_index
    if not PROXY_LIST:
        return None
    proxy = PROXY_LIST[_proxy_index % len(PROXY_LIST)]
    _proxy_index += 1
    return proxy

# Internal shared secret — must match INTERNAL_WEBHOOK_SECRET in Cloudflare Worker
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

def verify_internal_secret(req):
    """Reject requests not coming from our Cloudflare Worker."""
    if not INTERNAL_SECRET:
        if os.environ.get("ENV", "dev") == "production":
            raise RuntimeError("INTERNAL_SECRET is required in production")
        print("[security] WARNING: INTERNAL_SECRET not set — all requests accepted.")
        return True
    provided = req.headers.get("X-Internal-Secret", "")
    ok = provided == INTERNAL_SECRET
    if not ok:
        print(f"[security] Rejected request: secret mismatch (provided len={len(provided)}, expected len={len(INTERNAL_SECRET)})")
    return ok

def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name="auto"
    )

def download_from_gcs(bucket_name, source_blob_name, destination_file_name):
    """Download source asset from GCS using Default Service Account"""
    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(source_blob_name)
        blob.download_to_filename(destination_file_name)
        print(f"Successfully downloaded {source_blob_name} to {destination_file_name}")
    except Exception as e:
        print(f"GCS Download Error: {str(e)}")
        raise

@app.route('/transcript', methods=['POST'])
def extract_transcript():
    """Extract transcript using yt-dlp subtitle extraction (YouTube CC captions)."""
    if not verify_internal_secret(request):
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    url = data.get('url')
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    try:
        ydl_opts = {
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en'],
            'quiet': True,
            'remote_components': 'ejs:github',
            'nocheckcertificate': True,
        }
        
        proxy = get_proxy()
        if proxy:
            ydl_opts['proxy'] = proxy

        print(f"[transcript] Extracting subtitles for: {url}")
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            subs = info.get('requested_subtitles')
            
            if subs and 'en' in subs:
                sub_url = subs['en'].get('url')
                import urllib.request
                import re
                req = urllib.request.Request(sub_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req) as response:
                    sub_data = response.read().decode('utf-8')
                
                clean_lines = []
                for line in sub_data.split('\n'):
                    if '-->' in line or line.startswith('WEBVTT') or line.startswith('Kind:') or line.startswith('Language:') or not line.strip() or line.strip().isdigit():
                        continue
                    clean_line = re.sub(r'<[^>]+>', '', line).strip()
                    if clean_line:
                        if not clean_lines or clean_lines[-1] != clean_line:
                            clean_lines.append(clean_line)
                            
                transcript_text = " ".join(clean_lines)
                print(f"[transcript] Success: {len(transcript_text)} chars")
                return jsonify({'success': True, 'transcript': transcript_text})
            else:
                available = list(subs.keys()) if subs else []
                print(f"[transcript] No English subtitles found. Available: {available}")
                return jsonify({'error': f'No English transcript found. Available languages: {available}'}), 404
    except Exception as e:
        print(f"[transcript] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/render', methods=['POST'])
def process_video():
    """FFmpeg rendering pipeline to download, trim, and subtitle video (GCS source support)"""
    if not verify_internal_secret(request):
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    url = data.get('url') # Can be gs:// path or public URL
    start_time = data.get('start_time', 0)
    end_time = data.get('end_time', 15)
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    raw_path = None
    final_path = None
        
    raw_path = None
    final_path = None
    
    try:
        # Validate R2 credentials early
        if not (R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY):
            print("[render] FATAL: R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY.")
            return jsonify({'error': 'R2 storage credentials not configured'}), 503

        # Generate temporary files
        fd_raw, raw_path = tempfile.mkstemp(suffix='.mp4')
        os.close(fd_raw)
        fd_final, final_path = tempfile.mkstemp(suffix='.mp4')
        os.close(fd_final)

        stream_url = data.get('stream_url')

        # 1. Source Acquisition
        if stream_url:
            # Direct stream URL from Worker (bypasses YouTube IP blocks)
            print(f"[render] Downloading from direct stream URL: {stream_url[:80]}...")
            try:
                import urllib.request
                req = urllib.request.Request(stream_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=120) as resp:
                    with open(raw_path, 'wb') as f:
                        while True:
                            chunk = resp.read(8192)
                            if not chunk:
                                break
                            f.write(chunk)
                print(f"[render] Stream download complete: {os.path.getsize(raw_path)} bytes")
            except Exception as e:
                print(f"[render] Stream download failed: {str(e)}")
                return jsonify({'error': f'Stream download failed: {str(e)}'}), 502
            
            # Trim downloaded file to requested segment
            trim_path = raw_path + ".trimmed.mp4"
            trim_cmd = [
                "ffmpeg", "-y", "-ss", str(start_time), "-to", str(end_time),
                "-i", raw_path, "-c", "copy", trim_path
            ]
            print(f"[render] Trimming stream file: {start_time}s - {end_time}s")
            result = subprocess.run(trim_cmd, capture_output=True)
            if result.returncode != 0:
                stderr = result.stderr.decode('utf-8', errors='replace')[:500]
                print(f"[render] FFmpeg trim failed: {stderr}")
                return jsonify({'error': f'FFmpeg trim failed: {stderr}'}), 500
            os.replace(trim_path, raw_path)
        elif url.startswith("gs://"):
            # Internal File (GCS)
            bucket_name = url.split("/")[2]
            blob_name = "/".join(url.split("/")[3:])
            print(f"[render] Downloading from GCS: {bucket_name}/{blob_name}")
            download_from_gcs(bucket_name, blob_name, raw_path)
            
            # Trim GCS file if needed (GCS downloads entire file)
            trim_path = raw_path + ".trimmed.mp4"
            trim_cmd = [
                "ffmpeg", "-y", "-ss", str(start_time), "-to", str(end_time),
                "-i", raw_path, "-c", "copy", trim_path
            ]
            print(f"[render] Trimming GCS file: {start_time}s - {end_time}s")
            result = subprocess.run(trim_cmd, capture_output=True)
            if result.returncode != 0:
                stderr = result.stderr.decode('utf-8', errors='replace')[:500]
                print(f"[render] FFmpeg trim failed: {stderr}")
                return jsonify({'error': f'FFmpeg trim failed: {stderr}'}), 500
            os.replace(trim_path, raw_path)
        else:
            # External File (YouTube/Direct) via yt-dlp fallback
            print(f"[render] Downloading clip via yt-dlp: {url} ({start_time}s - {end_time}s)")
            download_cmd = [
                "yt-dlp",
                "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--download-sections", f"*{start_time}-{end_time}",
                "--force-keyframes-at-cuts",
                "-o", raw_path,
                "--no-playlist",
                "--remote-components", "ejs:github",
                "--no-check-certificates",
            ]
            proxy = get_proxy()
            if proxy:
                download_cmd.extend(["--proxy", proxy])
            download_cmd.append(url)
            
            result = subprocess.run(download_cmd, capture_output=True)
            if result.returncode != 0:
                stderr = result.stderr.decode('utf-8', errors='replace')[:1000]
                print(f"[render] yt-dlp download failed (exit={result.returncode}): {stderr}")
                return jsonify({'error': f'Video download failed: {stderr}'}), 500
            
            if not os.path.exists(raw_path) or os.path.getsize(raw_path) == 0:
                print(f"[render] Downloaded file empty or missing: {raw_path}")
                return jsonify({'error': 'Downloaded video file is empty'}), 500
            print(f"[render] Download complete: {os.path.getsize(raw_path)} bytes")
        
        # 2. Optimized Processing (aspect-aware crop + scale)
        print("[render] Rendering optimized clip...")
        aspect_ratio = data.get('aspect_ratio', '9/16')
        crop_center_x = data.get('crop_center_x')
        
        # Target dimensions per aspect ratio
        dims = {
            '9/16': (720, 1280),
            '16/9': (1280, 720),
            '1/1': (720, 720),
            '4/5': (720, 900),
        }
        target_w, target_h = dims.get(aspect_ratio, (720, 1280))
        
        # Default: scale and pad to target aspect ratio
        vf_chain = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2"
        
        # If face tracking data provided and vertical crop requested
        if crop_center_x is not None and aspect_ratio == '9/16':
            try:
                cx = float(crop_center_x)
                crop_filter = f"crop=ih*9/16:ih:iw*{cx}-ow/2:0"
                vf_chain = f"{crop_filter},scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2"
                print(f"[render] Applying intelligent crop centered at {cx}")
            except Exception as e:
                print(f"[render] Invalid crop_center_x skipped: {e}")

        render_cmd = [
            "ffmpeg", "-y", "-i", raw_path,
            "-vf", vf_chain,
            "-c:v", "libx264", 
            "-crf", "28",
            "-preset", "faster",
            "-c:a", "aac", "-b:a", "128k",
            final_path
        ]
        print(f"[render] Running FFmpeg: {' '.join(render_cmd)}")
        result = subprocess.run(render_cmd, capture_output=True)
        if result.returncode != 0:
            stderr = result.stderr.decode('utf-8', errors='replace')[:1000]
            print(f"[render] FFmpeg failed (exit={result.returncode}): {stderr}")
            return jsonify({'error': f'Video rendering failed: {stderr}'}), 500
        
        if not os.path.exists(final_path) or os.path.getsize(final_path) == 0:
            print(f"[render] Rendered file empty or missing: {final_path}")
            return jsonify({'error': 'Rendered video file is empty'}), 500
        print(f"[render] Render complete: {os.path.getsize(final_path)} bytes")

        # 3. Multi-Cloud Delivery (Upload to R2)
        output_key = f"renders/{os.path.basename(final_path)}.mp4"
        print(f"[render] Uploading to R2: {output_key}")
        
        s3 = get_r2_client()
        s3.upload_file(final_path, R2_BUCKET, output_key, ExtraArgs={'ContentType': 'video/mp4'})
        final_url = f"https://media.viraltrim.com/{output_key}"
        print(f"[render] Upload complete: {final_url}")

        return jsonify({'success': True, 'url': final_url})
        
    except Exception as e:
        print(f"[render] Unhandled error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    finally:
        # 4. Immediate Purge
        if raw_path and os.path.exists(raw_path):
            try:
                os.remove(raw_path)
            except Exception as e:
                print(f"[render] Failed to remove raw file: {e}")
        if final_path and os.path.exists(final_path):
            try:
                os.remove(final_path)
            except Exception as e:
                print(f"[render] Failed to remove final file: {e}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

