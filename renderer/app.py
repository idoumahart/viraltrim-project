from flask import Flask, request, jsonify
import os
import subprocess
import tempfile
import boto3
        

app = Flask(__name__)

# Cloudflare R2 Credentials via Environment Variables
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "viraltrim-media")
WEBSHARE_PROXY_URL = os.environ.get("WEBSHARE_PROXY_URL", "")

def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name="auto"
    )

@app.route('/transcript', methods=['POST'])
def extract_transcript():
    """Extract transcript using yt-dlp to bypass 429 blockades"""
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
            print(f"Using proxy for transcript extraction...")

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
                
                # Very basic stripping of VTT tags and timestamps
                clean_lines = []
                for line in sub_data.split('\n'):
                    # skip headers, timestamps, purely numeric lines
                    if '-->' in line or line.startswith('WEBVTT') or line.startswith('Kind:') or line.startswith('Language:') or not line.strip() or line.strip().isdigit():
                        continue
                    # strip internal <c> styles and positioning
                    clean_line = re.sub(r'<[^>]+>', '', line).strip()
                    if clean_line:
                        # Prevent duplicate lines (common in auto-subs)
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
    """FFmpeg rendering pipeline to download, trim, and subtitle video"""
    data = request.json
    url = data.get('url')
    start_time = data.get('start_time', 0)
    end_time = data.get('end_time', 15)
    
    if not url:
        return jsonify({'error': 'URL is required'}), 400
        
    try:
        # Generate temporary files for intermediate rendering inside the container
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as raw_vid, \
             tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as final_vid:
            
            raw_path = raw_vid.name
            final_path = final_vid.name

        # 1. Download specifically requested time-slice using yt-dlp
        print(f"Downloading clip from {start_time} to {end_time}...")
        download_cmd = [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--download-sections", f"*{start_time}-{end_time}",
            "--force-keyframes-at-cuts",
            "-o", raw_path
        ]
        
        if WEBSHARE_PROXY_URL:
            download_cmd.extend(["--proxy", WEBSHARE_PROXY_URL])
            print(f"Using proxy for video download...")
            
        download_cmd.append(url)
        subprocess.run(download_cmd, check=True, capture_output=True)
        
        # 2. Add sub-processing FFmpeg effects (Standard burn-in logic)
        # Note: Viral caption ASS generation logic would inject here.
        # For now, we perform a test transcode.
        transcode_cmd = [
            "ffmpeg", "-y", "-i", raw_path,
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac",
            final_path
        ]
        subprocess.run(transcode_cmd, check=True, capture_output=True)

        # 3. Upload Output to Cloudflare R2
        output_key = f"renders/{os.path.basename(final_path)}.mp4"
        print("Uploading to R2...")
        
        if R2_ACCOUNT_ID and R2_ACCESS_KEY:
            s3 = get_r2_client()
            s3.upload_file(final_path, R2_BUCKET, output_key, ExtraArgs={'ContentType': 'video/mp4'})
            final_url = f"https://media.viraltrim.com/{output_key}"
        else:
            final_url = "http://localhost/r2-missing-creds.mp4"

        # Cleanup Memory
        os.remove(raw_path)
        os.remove(final_path)

        return jsonify({'success': True, 'url': final_url})
        
    except Exception as e:
        print(f"Render Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
