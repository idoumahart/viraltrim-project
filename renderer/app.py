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

# Internal shared secret — must match INTERNAL_WEBHOOK_SECRET in Cloudflare Worker
INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")

def verify_internal_secret(req):
    """Reject requests not coming from our Cloudflare Worker."""
    if not INTERNAL_SECRET:
        print("[security] WARNING: INTERNAL_SECRET not set — all requests accepted.")
        return True
    return req.headers.get("X-Internal-Secret", "") == INTERNAL_SECRET

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
            'quiet': True
        }
        
        if WEBSHARE_PROXY_URL:
            ydl_opts['proxy'] = WEBSHARE_PROXY_URL

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
                return jsonify({'success': True, 'transcript': transcript_text})
            else:
                return jsonify({'error': 'No English transcript found in metadata'}), 404
    except Exception as e:
        print(f"Transcript Error: {str(e)}")
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
        
    try:
        # Generate temporary files
        fd_raw, raw_path = tempfile.mkstemp(suffix='.mp4')
        os.close(fd_raw)
        fd_final, final_path = tempfile.mkstemp(suffix='.mp4')
        os.close(fd_final)

        # 1. Source Acquisition
        if url.startswith("gs://"):
            # Internal File (GCS)
            bucket_name = url.split("/")[2]
            blob_name = "/".join(url.split("/")[3:])
            print(f"Downloading from GCS: {bucket_name}/{blob_name}")
            download_from_gcs(bucket_name, blob_name, raw_path)
            
            # Trim GCS file if needed (GCS downloads entire file)
            trim_path = raw_path + ".trimmed.mp4"
            trim_cmd = [
                "ffmpeg", "-y", "-ss", str(start_time), "-to", str(end_time),
                "-i", raw_path, "-c", "copy", trim_path
            ]
            subprocess.run(trim_cmd, check=True, capture_output=True)
            os.replace(trim_path, raw_path)
        else:
            # External File (YouTube/Direct)
            print(f"Downloading clip via yt-dlp: {url}")
            download_cmd = [
                "yt-dlp",  # Fixed: was "yt_dlp" (underscore), CLI binary uses hyphen
                "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--download-sections", f"*{start_time}-{end_time}",
                "--force-keyframes-at-cuts",
                "-o", raw_path,
                "--no-playlist",
            ]
            if WEBSHARE_PROXY_URL:
                download_cmd.extend(["--proxy", WEBSHARE_PROXY_URL])
            download_cmd.append(url)
            subprocess.run(download_cmd, check=True, capture_output=True)
        
        # 2. Optimized Processing (720p, CRF 28, Preset Faster)
        print("Rendering optimized 720p clip...")
        render_cmd = [
            "ffmpeg", "-y", "-i", raw_path,
            "-vf", "scale=720:-2",
            "-c:v", "libx264", 
            "-crf", "28",
            "-preset", "faster",
            "-c:a", "aac", "-b:a", "128k",
            final_path
        ]
        subprocess.run(render_cmd, check=True, capture_output=True)

        # 3. Multi-Cloud Delivery (Upload to R2)
        output_key = f"renders/{os.path.basename(final_path)}.mp4"
        print(f"Uploading to R2: {output_key}")
        
        if R2_ACCOUNT_ID and R2_ACCESS_KEY:
            s3 = get_r2_client()
            s3.upload_file(final_path, R2_BUCKET, output_key, ExtraArgs={'ContentType': 'video/mp4'})
            final_url = f"https://media.viraltrim.com/{output_key}"
        else:
            final_url = "http://localhost/r2-missing-creds.mp4"

        return jsonify({'success': True, 'url': final_url})
        
    except Exception as e:
        print(f"Render Error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        # 4. Immediate Purge
        if raw_path and os.path.exists(raw_path):
            os.remove(raw_path)
        if final_path and os.path.exists(final_path):
            os.remove(final_path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)

