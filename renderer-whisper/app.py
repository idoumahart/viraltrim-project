"""
ViralTrim Whisper Service
-------------------------
Google Cloud Run microservice for audio transcription using Faster-Whisper.
Returns timestamped word segments — no storage, no external APIs.

POST /transcribe
  Body: { "url": "<youtube or direct video url>" }
  Returns: {
    "success": true,
    "text": "full transcript...",
    "segments": [{ "word": "hello", "start": 0.5, "end": 0.9 }, ...]
  }

GET /health
  Returns: { "status": "ok", "model": "small" }
"""

import os
import tempfile
import subprocess
import threading
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

app = Flask(__name__)

INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")
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

# ─── Lazy model loading ────────────────────────────────────────────────────────
# Model loads on first /transcribe request, not at startup.
# This lets gunicorn bind to port 8080 immediately so Cloud Run health checks pass.
# A threading lock prevents concurrent downloads if two requests arrive at once.
_model_lock = threading.Lock()
_whisper_model = None

def get_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    with _model_lock:
        if _whisper_model is None:
            print("[whisper] Downloading and loading model (small, float32)... this takes ~60s on first cold start.")
            _whisper_model = WhisperModel("small", device="cpu", compute_type="float32")
            print("[whisper] Model ready.")
    return _whisper_model


def verify_internal_secret(req) -> bool:
    """Verify the caller is our Cloudflare Worker, not an external request."""
    if not INTERNAL_SECRET:
        if os.environ.get("ENV", "dev") == "production":
            raise RuntimeError("INTERNAL_SECRET is required in production")
        print("[security] WARNING: INTERNAL_SECRET is not set. All requests are accepted.")
        return True
    provided = req.headers.get("X-Internal-Secret", "")
    return provided == INTERNAL_SECRET


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": "small", "service": "viraltrim-whisper"})


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """
    Download audio from a URL and transcribe it with Faster-Whisper.
    Only audio is downloaded (not the full video) to minimize memory and time.
    Temporary files are always purged in the finally block.
    """
    if not verify_internal_secret(request):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    if not data or not data.get("url"):
        return jsonify({"error": "URL is required"}), 400

    url = data["url"]
    audio_path = None

    try:
        # Step 1: Download audio only using yt-dlp
        # -x = extract audio only, no need to download full video
        # --audio-format wav = Whisper works best with wav
        # --audio-quality 0 = best quality
        fd, audio_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)

        download_cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "wav",
            "--audio-quality", "0",
            "-o", audio_path,
            "--no-playlist",
            "--quiet",
            "--remote-components", "ejs:github",
            "--no-check-certificates",
        ]

        # Apply proxy if configured (helps with geo-restricted content)
        proxy = get_proxy()
        if proxy:
            download_cmd.extend(["--proxy", proxy])

        download_cmd.append(url)

        print(f"[whisper] Downloading audio from: {url}")
        result = subprocess.run(download_cmd, capture_output=True, timeout=120)

        if result.returncode != 0:
            err = result.stderr.decode("utf-8", errors="replace")
            print(f"[whisper] yt-dlp failed: {err}")
            return jsonify({"error": f"Audio download failed: {err[:200]}"}), 500

        # Check file actually exists and has content
        if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            # yt-dlp sometimes appends format to filename
            wav_variants = [audio_path + ".wav", audio_path.replace(".wav", "") + ".wav"]
            found = None
            for v in wav_variants:
                if os.path.exists(v) and os.path.getsize(v) > 0:
                    found = v
                    break
            if not found:
                return jsonify({"error": "Audio file empty or not found after download"}), 500
            audio_path = found

        # Step 2: Transcribe with Faster-Whisper
        print(f"[whisper] Transcribing: {audio_path} ({os.path.getsize(audio_path)} bytes)")
        segments_iter, info = get_model().transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=True,  # Required for kinetic captions
            language="en",         # Assume English — add auto-detect later if needed
            vad_filter=True,       # Filter silence — improves accuracy
            vad_parameters={"min_silence_duration_ms": 500},
        )

        # Collect all segments and words
        full_text_parts = []
        word_segments = []

        for segment in segments_iter:
            full_text_parts.append(segment.text.strip())
            if segment.words:
                for word in segment.words:
                    word_segments.append({
                        "word": word.word.strip(),
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                    })

        full_text = " ".join(full_text_parts)

        print(f"[whisper] Done. {len(word_segments)} words, {len(full_text)} chars.")
        return jsonify({
            "success": True,
            "text": full_text,
            "segments": word_segments,
            "language": info.language,
            "duration": round(info.duration, 1),
        })

    except subprocess.TimeoutExpired:
        print("[whisper] yt-dlp timed out after 120s")
        return jsonify({"error": "Audio download timed out"}), 504

    except Exception as e:
        print(f"[whisper] Transcription error: {str(e)}")
        return jsonify({"error": str(e)}), 500

    finally:
        # Always purge the temp audio file — /tmp uses RAM on Cloud Run
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
                print(f"[whisper] Purged temp file: {audio_path}")
            except Exception:
                pass


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
