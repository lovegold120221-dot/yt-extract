# Eburon Extract

> YouTube media extraction platform - subtitles, audio, and video downloads.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Vercel-000000)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Subtitles**: Download YouTube video subtitles in SRT, TXT, or RAW format
- **Audio Extraction**: Extract audio as MP3, WAV, or WebM
- **Video Download**: Download videos in 480p, 720p, or 1080p quality
- **Modern UI**: Premium dark interface with real-time terminal output
- **Vercel Ready**: Deploys instantly to Vercel's global network

## Live Demo

**Production URL**: https://eburon-extract.vercel.app

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, Tailwind CSS, Vanilla JS |
| Backend | Node.js, Express |
| YouTube | ytdl-core |
| Deployment | Vercel |

## Project Structure

```
eburon-extract/
├── index.html      # Frontend UI
├── server.js       # Express backend API
├── vercel.json     # Vercel configuration
├── package.json    # Node.js dependencies
└── README.md       # This file
```

## Getting Started

### Local Development

```bash
# Clone the repository
git clone https://github.com/lovegold120221-dot/yt-extract.git
cd yt-extract

# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:8122
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8122` |

## API Reference

### Health Check

```
GET /api/health
```

Response:
```json
{
  "status": "online",
  "service": "Eburon Extract v1.0"
}
```

### Extract Media

```
POST /api/extract
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=...",
  "media": "subs|audio|video",
  "format": "srt|txt|raw",
  "audio_format": "mp3|wav|webm",
  "video_quality": "480|720|1080"
}
```

### Download File

```
GET /api/download/:jobId/:type
```

### Get Video Info

```
GET /api/info?url=https://www.youtube.com/watch?v=...
```

## Usage

1. Enter a YouTube URL
2. Select media type (Subtitles, Audio, or Video)
3. Choose format/quality options
4. Click "Initialize Extraction"
5. Download when ready

## Deployment to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Production deploy
vercel --prod
```

## Known Limitations

- Subtitle extraction requires YouTube to have available captions
- Video/Audio extraction uses streaming - large files may take time
- Vercel serverless has memory limits for large downloads

## Troubleshooting

### 404 on deployment
Ensure `vercel.json` routes are configured correctly. The server.js must handle all routes including `/`.

### Captions not available
Some YouTube videos don't have captions. Try a different video or use auto-generated captions if available.

### Download fails
Check browser console for CORS errors. Ensure the server is properly configured with CORS headers.

## License

MIT License - See LICENSE file for details.

---

Built with by Eburon Labs