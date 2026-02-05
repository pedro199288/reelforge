# ReelForge

An AI-powered video editing automation tool for creating engaging short-form content (TikTok, Reels, YouTube Shorts). ReelForge automates the tedious parts of video editing: silence removal, caption generation, take selection, and effects application.

## Features

- **Automated Silence Detection** - Uses FFmpeg to detect and remove pauses/silences from raw footage
- **AI Transcription** - Whisper.cpp integration for accurate speech-to-text with word-level timestamps
- **Smart Take Selection** - AI-powered analysis to automatically select the best takes when you repeat phrases
- **Caption Generation** - Automatic subtitle generation with customizable styling (TikTok-style captions)
- **Effects Analysis** - AI detects key moments for zooms, highlights, and emphasis effects
- **Batch Processing** - Process multiple videos in parallel with a unified pipeline
- **Non-Linear Editor** - Timeline-based editor for fine-tuning cuts and captions
- **Script Alignment** - Import your script to improve transcription accuracy and take selection

## Tech Stack

- **Frontend**: React 19, TanStack Router, Zustand, Tailwind CSS, shadcn/ui
- **Video**: Remotion for programmatic video composition and rendering
- **AI**: Anthropic Claude, OpenAI GPT-4, local models via Ollama/LM Studio
- **Audio**: FFmpeg for processing, Whisper.cpp for transcription
- **Runtime**: Bun

## Pipeline Overview

ReelForge processes videos through an 8-phase pipeline:

```
Raw Video (+ optional script)
    │
    ├─────────────────────────┐
    │                         │
    ▼                         ▼
Silences              Full-Captions
    │                   (Whisper)
    ▼                         │
Segments                      │
(+ AI preselection)           │
    │                         │
    ▼                         │
Cut                           │
(+ cut-map)                   │
    │                         │
    └─────────────────────────┘
                │
                ▼
           Captions
      (derived + scoring)
                │
                ▼
       Effects-Analysis
          (optional)
                │
                ▼
           Rendered
```

Each phase generates intermediate files, allowing you to resume from any point or manually adjust settings.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- FFmpeg installed and available in PATH
- (Optional) Whisper.cpp for local transcription

### Installation

```bash
bun install
```

### Development

```bash
# Start the Vite dev server
bun run dev

# Start all services (Vite + API + Remotion Studio)
bun run dev:all

# Run Remotion Studio only
bun run studio
```

### Processing Videos

1. Drop a video file into the app
2. Configure silence detection parameters (threshold, min duration)
3. (Optional) Import your script for better transcription
4. Run the pipeline - silences are detected, video is cut, captions are generated
5. Review and adjust in the editor
6. Render the final video with captions and effects

### CLI Commands

```bash
# Generate subtitles for a video
bun run create-subtitles <path-to-video>

# Process a video through the full pipeline
bun run process <path-to-video>
```

## Project Structure

```
src/
├── app/              # TanStack Router pages
├── components/       # React components (shadcn/ui based)
├── core/             # Business logic
│   ├── batch/        # Batch processing
│   ├── effects/      # AI effects analysis
│   ├── semantic/     # Semantic segmentation
│   ├── silence/      # Silence detection
│   ├── takes/        # Take selection & scoring
│   └── timeline/     # Timeline operations
├── hooks/            # React hooks
├── lib/              # Utilities
├── remotion-compositions/  # Remotion video templates
├── store/            # Zustand stores
└── types/            # TypeScript types

server/               # Backend API (Bun)
public/
├── videos/           # Video files (raw, cut, rendered)
├── pipeline/         # Pipeline intermediate files
└── subs/             # Caption files (JSON)
```

## Configuration

### Whisper Models

The default model is `medium.en`. To change it or use non-English languages, edit `whisper-config.mjs`:

```javascript
export const WHISPER_MODEL = "medium"; // Remove .en suffix for multilingual
```

### Silence Detection Presets

| Content Type | Threshold | Min Duration | Notes |
|-------------|-----------|--------------|-------|
| Podcast | -40 dB | 0.8s | More sensitive, longer natural pauses |
| Tutorial | -35 dB | 0.5s | Standard balance |
| Presentation | -30 dB | 1.0s | Allow dramatic pauses |
| Vlog/Dynamic | -35 dB | 0.3s | Aggressive cutting |

## License

Private - All rights reserved.
