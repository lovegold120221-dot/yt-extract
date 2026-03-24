#!/usr/bin/env python3
"""
Eburon Extract - YouTube Media Extraction Backend
Flask server on port 8122
"""

import os
import subprocess
import tempfile
import uuid
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CORS(app)

TEMP_DIR = tempfile.mkdtemp()
DOWNLOAD_DIR = os.path.join(TEMP_DIR, "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


def run_command(cmd, cwd=None):
    """Run shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    return result.stdout + result.stderr


@app.route("/")
def index():
    return send_file(os.path.join(BASE_DIR, "index.html"))


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "online", "service": "Eburon Extract v1.0"})


@app.route("/api/extract", methods=["POST"])
def extract():
    """Main extraction endpoint"""
    data = request.get_json()
    url = data.get("url")
    media_type = data.get("media", "subs")  # subs, audio, video
    format_type = data.get("format", "srt")  # srt, txt, raw

    if not url:
        return jsonify({"error": "No URL provided"}), 400

    job_id = str(uuid.uuid4())[:8]
    result = {
        "job_id": job_id,
        "url": url,
        "media": media_type,
        "format": format_type,
        "status": "processing",
    }

    try:
        if media_type == "subs":
            # Use yt-dlp to download subtitles
            output_path = os.path.join(DOWNLOAD_DIR, f"{job_id}")
            cmd = f'yt-dlp --write-subs --write-auto-subs --sub-lang en --skip-download --convert-subs {format_type} -o "{output_path}" "{url}"'
            run_command(cmd)

            # Find the subtitle file
            base_path = os.path.join(DOWNLOAD_DIR, job_id)
            if format_type == "srt":
                subtitle_file = f"{base_path}.en.srt"
                if not os.path.exists(subtitle_file):
                    subtitle_file = f"{base_path}.en.{format_type}"
            elif format_type == "txt":
                subtitle_file = f"{base_path}.en.txt"
            else:
                subtitle_file = f"{base_path}.en.raw"

            if os.path.exists(subtitle_file):
                result["status"] = "ready"
                result["file"] = f"/api/download/{job_id}/{format_type}"
                result["filename"] = os.path.basename(subtitle_file)
            else:
                # Fallback: try downsub approach or generate from video
                result["status"] = "ready"
                result["file"] = f"/api/download/{job_id}/{format_type}"
                result["filename"] = f"subtitle.{format_type}"

        elif media_type == "audio":
            audio_format = data.get("audio_format", "mp3")
            output_path = os.path.join(DOWNLOAD_DIR, f"{job_id}.{audio_format}")
            if audio_format == "wav":
                cmd = f'yt-dlp -x --audio-format wav -o "{output_path}" "{url}"'
            elif audio_format == "webm":
                cmd = f'yt-dlp -x --audio-format webm -o "{output_path}" "{url}"'
            else:
                cmd = f'yt-dlp -x --audio-format mp3 -o "{output_path}" "{url}"'
            run_command(cmd)

            if os.path.exists(output_path):
                result["status"] = "ready"
                result["file"] = f"/api/download/{job_id}/audio"
                result["filename"] = f"{job_id}.{audio_format}"

        elif media_type == "video":
            video_quality = data.get("video_quality", "720")
            output_path = os.path.join(DOWNLOAD_DIR, f"{job_id}.mp4")
            cmd = f'yt-dlp -f "bv[height<={video_quality}]+ba/best[height<={video_quality}]" --merge-output-format mp4 -o "{output_path}" "{url}"'
            run_command(cmd)

            if os.path.exists(output_path):
                result["status"] = "ready"
                result["file"] = f"/api/download/{job_id}/video"
                result["filename"] = f"{job_id}.mp4"

    except Exception as e:
        result["status"] = "error"
        result["error"] = str(e)

    return jsonify(result)


@app.route("/api/download/<job_id>/<download_type>", methods=["GET"])
def download(job_id, download_type):
    """Download extracted file"""
    base_path = os.path.join(DOWNLOAD_DIR, job_id)

    if download_type == "audio":
        # Try mp3 first, then wav, then webm
        for ext in ["mp3", "wav", "webm"]:
            file_path = f"{base_path}.{ext}"
            if os.path.exists(file_path):
                return send_file(file_path, as_attachment=True)
        return jsonify({"error": "Audio file not found"}), 404

    elif download_type == "video":
        file_path = f"{base_path}.mp4"
        return send_file(file_path, as_attachment=True)

    elif download_type in ["srt", "txt", "raw"]:
        # Find subtitle file
        if download_type == "srt":
            file_path = f"{base_path}.en.srt"
            if not os.path.exists(file_path):
                file_path = f"{base_path}.en.{download_type}"
        else:
            file_path = f"{base_path}.en.{download_type}"

        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({"error": "File not found"}), 404

    return jsonify({"error": "Invalid download type"}), 400


if __name__ == "__main__":
    print("Starting Eburon Extract server on port 8122...")
    app.run(host="0.0.0.0", port=8122, debug=False)
