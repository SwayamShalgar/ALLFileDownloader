from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit
import yt_dlp
import os
import re
from pathlib import Path
from dotenv import load_dotenv
import time

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['DOWNLOAD_FOLDER'] = os.getenv('DOWNLOAD_FOLDER', 'static/downloads')
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_CONTENT_LENGTH', 524288000))

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

os.makedirs(app.config['DOWNLOAD_FOLDER'], exist_ok=True)

def validate_url(url):
    patterns = {
        'youtube': r'(https?://)?(www\.)?(youtube|youtu|youtube-nocookie)\.(com|be)/',
        'instagram': r'(https?://)?(www\.)?instagram\.com/',
        'facebook': r'(https?://)?(www\.)?(facebook|fb)\.(com|watch)/',
        'pinterest': r'(https?://)?(www\.)?pinterest\.(com|co\.uk|ca|fr|de|es|it)/'
    }
    for platform, pattern in patterns.items():
        if re.match(pattern, url):
            return platform
    return None

def get_video_info(url):
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = []
            seen_formats = set()
            if 'formats' in info:
                for f in info['formats']:
                    if f.get('vcodec') != 'none' and f.get('acodec') != 'none':
                        resolution = f.get('height', 0)
                        ext = f.get('ext', 'mp4')
                        format_id = f.get('format_id')
                        filesize = f.get('filesize', 0)
                        if resolution and resolution not in seen_formats:
                            seen_formats.add(resolution)
                            formats.append({
                                'format_id': format_id,
                                'quality': f"{resolution}p",
                                'ext': ext,
                                'resolution': resolution,
                                'filesize': filesize if filesize else 'Unknown'
                            })
            formats.sort(key=lambda x: x['resolution'], reverse=True)
            return {
                'success': True,
                'title': info.get('title', 'Unknown'),
                'thumbnail': info.get('thumbnail', ''),
                'duration': info.get('duration', 0),
                'formats': formats[:10]
            }
    except Exception as e:
        # Specifically handle Pinterest failure
        if validate_url(url) == "pinterest":
            return {
                'success': False,
                'error': 'Pinterest video downloading is currently broken due to Pinterest site changes. Try updating yt-dlp or check for new updates in the future.'
            }
        return {
            'success': False,
            'error': str(e)
        }

def progress_hook(d):
    if d['status'] == 'downloading':
        percent_str = d.get('_percent_str', '0%').replace('%', '').strip()
        try:
            percentage = float(percent_str)
        except:
            percentage = 0
        downloaded = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes', 0) or d.get('total_bytes_estimate', 0)
        speed = d.get('speed', 0)
        eta = d.get('eta', 0)
        socketio.emit('download_progress', {
            'percentage': round(percentage, 1),
            'downloaded': downloaded,
            'total': total,
            'speed': speed,
            'eta': eta,
            'status': 'downloading'
        })
    elif d['status'] == 'finished':
        socketio.emit('download_progress', {
            'percentage': 100,
            'status': 'finished',
            'message': 'Processing... Please wait'
        })

def download_video(url, format_id=None):
    output_path = os.path.join(app.config['DOWNLOAD_FOLDER'], '%(title)s.%(ext)s')
    ydl_opts = {
        'outtmpl': output_path,
        'quiet': False,
        'no_warnings': False,
        'format': 'best',
        'merge_output_format': 'mp4',
        'progress_hooks': [progress_hook],
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            return {
                'success': True,
                'filename': os.path.basename(filename),
                'filepath': filename,
                'title': info.get('title', 'Unknown')
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/video-info', methods=['POST'])
def video_info():
    data = request.get_json()
    url = data.get('url', '')
    if not url:
        return jsonify({'success': False, 'error': 'URL is required'}), 400
    platform = validate_url(url)
    if not platform:
        return jsonify({'success': False, 'error': 'Unsupported platform or invalid URL'}), 400
    info = get_video_info(url)
    # Handle case where get_video_info returns None
    if info is None:
        return jsonify({'success': False, 'error': 'Failed to retrieve video information'}), 500
    # If known yt-dlp issue (like Pinterest), display message
    if not info.get('success', False):
        if platform == "pinterest":
            return jsonify({'success': False, 'error': 'Pinterest download is currently not supported due to site changes. Please use YouTube, Instagram, or Facebook.'}), 400
        else:
            error_msg = info.get('error', 'Unknown error occurred while fetching video information')
            return jsonify({'success': False, 'error': error_msg}), 400
    info['platform'] = platform
    return jsonify(info)


@app.route('/api/download', methods=['POST'])
def download():
    data = request.get_json()
    url = data.get('url', '')
    format_id = data.get('format_id', None)
    if not url:
        return jsonify({'success': False, 'error': 'URL is required'}), 400
    platform = validate_url(url)
    if not platform:
        return jsonify({'success': False, 'error': 'Unsupported platform'}), 400
    result = download_video(url, format_id)
    return jsonify(result)

@app.route('/api/get-file/<filename>')
def get_file(filename):
    try:
        filepath = os.path.join(app.config['DOWNLOAD_FOLDER'], filename)
        if os.path.exists(filepath):
            return send_file(filepath, as_attachment=True)
        else:
            return jsonify({'success': False, 'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/cleanup', methods=['POST'])
def cleanup():
    try:
        folder = app.config['DOWNLOAD_FOLDER']
        current_time = time.time()
        for filename in os.listdir(folder):
            filepath = os.path.join(folder, filename)
            if os.path.isfile(filepath):
                if current_time - os.path.getmtime(filepath) > 3600:
                    os.remove(filepath)
        return jsonify({'success': True, 'message': 'Cleanup completed'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # For local development only
    socketio.run(app, debug=True)

