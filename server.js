const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const TEMP_DIR = '/tmp/yt-extract';
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
const DOWNLOAD_DIR = path.join(TEMP_DIR, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function runCommand(cmd) {
    try {
        const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
        return output;
    } catch (err) {
        return err.stdout + err.stderr;
    }
}

function generateJobId() {
    return Math.random().toString(36).substring(2, 10);
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'online', service: 'Eburon Extract v1.0' });
});

app.post('/api/extract', (req, res) => {
    const { url, media = 'subs', format = 'srt', audio_format = 'mp3', video_quality = '720' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    const jobId = generateJobId();
    const result = {
        job_id: jobId,
        url,
        media,
        format,
        status: 'processing'
    };

    try {
        if (media === 'subs') {
            const outputPath = path.join(DOWNLOAD_DIR, jobId);
            const cmd = `yt-dlp --write-subs --write-auto-subs --sub-lang en --skip-download --convert-subs ${format} -o "${outputPath}" "${url}"`;
            runCommand(cmd);

            const basePath = path.join(DOWNLOAD_DIR, jobId);
            let subtitleFile = `${basePath}.en.${format}`;
            if (!fs.existsSync(subtitleFile)) {
                subtitleFile = `${basePath}.en.srt`;
            }

            if (fs.existsSync(subtitleFile)) {
                result.status = 'ready';
                result.file = `/api/download/${jobId}/${format}`;
                result.filename = path.basename(subtitleFile);
            } else {
                result.status = 'ready';
                result.file = `/api/download/${jobId}/${format}`;
                result.filename = `subtitle.${format}`;
            }
        } else if (media === 'audio') {
            const outputPath = path.join(DOWNLOAD_DIR, `${jobId}.${audio_format}`);
            const cmd = `yt-dlp -x --audio-format ${audio_format} -o "${outputPath}" "${url}"`;
            runCommand(cmd);

            if (fs.existsSync(outputPath)) {
                result.status = 'ready';
                result.file = `/api/download/${jobId}/audio`;
                result.filename = `${jobId}.${audio_format}`;
            }
        } else if (media === 'video') {
            const outputPath = path.join(DOWNLOAD_DIR, `${jobId}.mp4`);
            const cmd = `yt-dlp -f "bv[height<=${video_quality}]+ba/best[height<=${video_quality}]" --merge-output-format mp4 -o "${outputPath}" "${url}"`;
            runCommand(cmd);

            if (fs.existsSync(outputPath)) {
                result.status = 'ready';
                result.file = `/api/download/${jobId}/video`;
                result.filename = `${jobId}.mp4`;
            }
        }
    } catch (err) {
        result.status = 'error';
        result.error = err.message;
    }

    res.json(result);
});

app.get('/api/download/:jobId/:type', (req, res) => {
    const { jobId, type } = req.params;
    const basePath = path.join(DOWNLOAD_DIR, jobId);

    if (type === 'audio') {
        for (const ext of ['mp3', 'wav', 'webm', 'm4a']) {
            const filePath = `${basePath}.${ext}`;
            if (fs.existsSync(filePath)) {
                return res.download(filePath);
            }
        }
        return res.status(404).json({ error: 'Audio file not found' });
    }

    if (type === 'video') {
        const filePath = `${basePath}.mp4`;
        if (fs.existsSync(filePath)) {
            return res.download(filePath);
        }
        return res.status(404).json({ error: 'Video file not found' });
    }

    if (['srt', 'txt', 'raw'].includes(type)) {
        let filePath = `${basePath}.en.${type}`;
        if (!fs.existsSync(filePath)) {
            filePath = `${basePath}.en.srt`;
        }
        if (fs.existsSync(filePath)) {
            return res.download(filePath);
        }
        return res.status(404).json({ error: 'Subtitle file not found' });
    }

    res.status(400).json({ error: 'Invalid download type' });
});

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8122;
app.listen(PORT, () => {
    console.log(`Eburon Extract server running on port ${PORT}`);
});

module.exports = app;