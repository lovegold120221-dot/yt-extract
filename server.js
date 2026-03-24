const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
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

function generateJobId() {
    return Math.random().toString(36).substring(2, 10);
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'online', service: 'Eburon Extract v1.0' });
});

app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    try {
        const info = await ytdl.getInfo(url);
        res.json({
            title: info.videoDetails.title,
            duration: info.videoDetails.lengthSeconds,
            thumbnail: info.videoDetails.thumbnails[0]?.url,
            formats: info.formats.map(f => ({
                itag: f.itag,
                quality: f.qualityLabel || f.quality,
                type: f.mimeType?.split(';')[0] || 'unknown',
                hasAudio: f.hasAudio,
                hasVideo: f.hasVideo
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/extract', async (req, res) => {
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
        const info = await ytdl.getInfo(url);

        if (media === 'audio') {
            const outputPath = path.join(DOWNLOAD_DIR, `${jobId}.${audio_format}`);
            const stream = ytdl.downloadFromInfo(info, {
                filter: 'audioonly',
                quality: 'highestaudio'
            });
            const writeStream = fs.createWriteStream(outputPath);

            stream.on('end', () => {
                result.status = 'ready';
                result.file = `/api/download/${jobId}/audio`;
                result.filename = `${jobId}.${audio_format}`;
                res.json(result);
            });

            stream.on('error', (err) => {
                result.status = 'error';
                result.error = err.message;
                res.status(500).json(result);
            });

            stream.pipe(writeStream);

        } else if (media === 'video') {
            const qualityMap = {
                '480': '360p',
                '720': '720p', 
                '1080': '1080p'
            };
            const quality = qualityMap[video_quality] || '720p';

            const outputPath = path.join(DOWNLOAD_DIR, `${jobId}.mp4`);

            // Get format - prefer itag with both video and audio
            const format = ytdl.chooseFormat(info.formats, {
                filter: f => f.hasVideo && f.hasAudio,
                quality: 'highest'
            });

            if (!format) {
                result.status = 'error';
                result.error = 'No suitable format found';
                return res.status(400).json(result);
            }

            const stream = ytdl.downloadFromInfo(info, { format });
            const writeStream = fs.createWriteStream(outputPath);

            stream.on('end', () => {
                result.status = 'ready';
                result.file = `/api/download/${jobId}/video`;
                result.filename = `${jobId}.mp4`;
                res.json(result);
            });

            stream.on('error', (err) => {
                result.status = 'error';
                result.error = err.message;
                res.status(500).json(result);
            });

            stream.pipe(writeStream);

        } else {
            // Subtitles - use ytdl-core's caption extraction
            const captions = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

            if (captions && captions.length > 0) {
                const caption = captions.find(c => c.languageCode === 'en') || captions[0];
                result.status = 'ready';
                result.file = `/api/caption/${jobId}/${format}`;
                result.captionUrl = caption.baseUrl;
                result.filename = `${info.videoDetails.videoId}.${format}`;
                res.json(result);
            } else {
                result.status = 'error';
                result.error = 'No captions available for this video';
                res.status(404).json(result);
            }
        }
    } catch (err) {
        result.status = 'error';
        result.error = err.message;
        res.status(500).json(result);
    }
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

    res.status(400).json({ error: 'Invalid download type' });
});

app.get('/api/caption/:jobId/:format', async (req, res) => {
    const { jobId, format } = req.params;
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Caption URL required' });
    }

    try {
        const response = await fetch(url);
        let text = await response.text();

        if (format === 'txt') {
            // Strip HTML tags for plain text
            text = text.replace(/<[^>]*>/g, '');
        } else if (format === 'srt') {
            // Convert YouTube XML transcript to SRT
            text = convertToSRT(text);
        }

        res.type(format === 'txt' ? 'text/plain' : 'text/srt');
        res.send(text);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function convertToSRT(xml) {
    const captions = xml.match(/<text[^>]*>([^<]*)<\/text>/g) || [];
    let srt = '';
    let index = 1;

    captions.forEach(caption => {
        const startMatch = caption.match(/start="([^"]*)"/);
        const durMatch = caption.match(/dur="([^"]*)"/);
        const textMatch = caption.match(/>([^<]*)<\/text>/);

        if (startMatch && textMatch) {
            const start = parseFloat(startMatch[1]);
            const dur = durMatch ? parseFloat(durMatch[1]) : 3;
            const end = start + dur;
            const text = textMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

            srt += `${index}\n${formatTime(start)} --> ${formatTime(end)}\n${text}\n\n`;
            index++;
        }
    });

    return srt;
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

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