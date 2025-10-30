let currentVideoInfo = null;
let socket = null;

// Initialize SocketIO connection
document.addEventListener('DOMContentLoaded', function() {
    socket = io();
    
    // Listen for download progress updates
    socket.on('download_progress', function(data) {
        updateProgressBar(data);
    });
});

// Show alert message
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="fas fa-${type === 'danger' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    alertContainer.innerHTML = alertHTML;
    
    setTimeout(() => {
        const alert = alertContainer.querySelector('.alert');
        if (alert) {
            alert.classList.remove('show');
            setTimeout(() => alertContainer.innerHTML = '', 150);
        }
    }, 5000);
}

// Format duration from seconds
function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes || bytes === 'Unknown') return 'Unknown';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Format speed
function formatSpeed(bytesPerSec) {
    if (!bytesPerSec) return '-- KB/s';
    if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
    if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(2) + ' KB/s';
    return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
}

// Format ETA
function formatETA(seconds) {
    if (!seconds || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update progress bar with real-time data
function updateProgressBar(data) {
    const progressBar = document.getElementById('progressBar');
    const progressPercentage = document.getElementById('progressPercentage');
    const progressText = document.getElementById('progressText');
    const downloadSpeed = document.getElementById('downloadSpeed');
    const downloadedSize = document.getElementById('downloadedSize');
    const downloadETA = document.getElementById('downloadETA');
    
    if (data.status === 'downloading') {
        const percentage = data.percentage || 0;
        
        // Update progress bar
        progressBar.style.width = percentage + '%';
        progressBar.setAttribute('aria-valuenow', percentage);
        progressBar.textContent = percentage.toFixed(1) + '%';
        
        // Update percentage text
        progressPercentage.textContent = percentage.toFixed(1) + '%';
        progressText.textContent = 'Downloading...';
        
        // Update stats
        downloadSpeed.textContent = formatSpeed(data.speed);
        downloadedSize.textContent = formatFileSize(data.downloaded);
        downloadETA.textContent = formatETA(data.eta);
        
    } else if (data.status === 'finished') {
        progressBar.style.width = '100%';
        progressBar.setAttribute('aria-valuenow', 100);
        progressBar.textContent = '100%';
        progressPercentage.textContent = '100%';
        progressText.textContent = data.message || 'Processing... Please wait';
    }
}

// Fetch video information
document.getElementById('urlForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('videoUrl').value.trim();
    const fetchButton = document.getElementById('fetchButton');
    
    if (!url) {
        showAlert('Please enter a video URL', 'danger');
        return;
    }
    
    fetchButton.disabled = true;
    fetchButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Fetching...';
    
    document.getElementById('videoInfoSection').style.display = 'none';
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('downloadCompleteSection').style.display = 'none';
    
    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: url })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentVideoInfo = data;
            displayVideoInfo(data);
            showAlert('Video information fetched successfully!', 'success');
        } else {
            showAlert(data.error || 'Failed to fetch video information', 'danger');
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'danger');
        console.error('Error:', error);
    } finally {
        fetchButton.disabled = false;
        fetchButton.innerHTML = '<i class="fas fa-search me-2"></i>Fetch Info';
    }
});

// Display video information
function displayVideoInfo(data) {
    const videoInfoSection = document.getElementById('videoInfoSection');
    const thumbnail = document.getElementById('videoThumbnail');
    const title = document.getElementById('videoTitle');
    const duration = document.getElementById('videoDuration');
    const platformBadge = document.getElementById('platformBadge');
    const qualitySelect = document.getElementById('qualitySelect');
    
    thumbnail.src = data.thumbnail || 'https://via.placeholder.com/300x200?text=No+Thumbnail';
    title.textContent = data.title;
    duration.textContent = formatDuration(data.duration);
    platformBadge.textContent = data.platform.charAt(0).toUpperCase() + data.platform.slice(1);
    platformBadge.className = `badge bg-${data.platform === 'youtube' ? 'danger' : data.platform === 'facebook' ? 'primary' : 'info'}`;
    
    qualitySelect.innerHTML = '<option value="">Best Quality (Auto)</option>';
    if (data.formats && data.formats.length > 0) {
        data.formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.format_id;
            option.textContent = `${format.quality} - ${format.ext.toUpperCase()} ${format.filesize !== 'Unknown' ? '(' + formatFileSize(format.filesize) + ')' : ''}`;
            qualitySelect.appendChild(option);
        });
    }
    
    videoInfoSection.style.display = 'block';
    videoInfoSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Download video
document.getElementById('downloadButton').addEventListener('click', async () => {
    const url = document.getElementById('videoUrl').value.trim();
    const formatId = document.getElementById('qualitySelect').value;
    const downloadButton = document.getElementById('downloadButton');
    
    downloadButton.disabled = true;
    downloadButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Preparing...';
    
    // Reset and show progress section
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressPercentage').textContent = '0%';
    document.getElementById('progressText').textContent = 'Preparing download...';
    document.getElementById('downloadSpeed').textContent = '-- KB/s';
    document.getElementById('downloadedSize').textContent = '-- MB';
    document.getElementById('downloadETA').textContent = '--:--';
    
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('downloadCompleteSection').style.display = 'none';
    document.getElementById('progressSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                url: url,
                format_id: formatId || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('progressSection').style.display = 'none';
            document.getElementById('downloadCompleteSection').style.display = 'block';
            
            const downloadLink = document.getElementById('downloadLink');
            downloadLink.href = `/api/get-file/${data.filename}`;
            downloadLink.download = data.filename;
            
            document.getElementById('downloadCompleteSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            showAlert('Video downloaded successfully!', 'success');
        } else {
            document.getElementById('progressSection').style.display = 'none';
            showAlert(data.error || 'Failed to download video', 'danger');
        }
    } catch (error) {
        document.getElementById('progressSection').style.display = 'none';
        showAlert('Network error during download. Please try again.', 'danger');
        console.error('Error:', error);
    } finally {
        downloadButton.disabled = false;
        downloadButton.innerHTML = '<i class="fas fa-download me-2"></i>Download Video';
    }
});

// Cleanup old files on page load
window.addEventListener('load', async () => {
    try {
        await fetch('/api/cleanup', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Cleanup error:', error);
    }
});
