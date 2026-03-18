# Natively

Natively is an Electron overlay assistant for meetings, interviews, and live problem solving. It captures live transcript context, grabs the current screen, and routes prompts to a selectable LLM provider. On launch, the app opens a setup window so the user can choose an LLM (`Ollama` or `Gemini`) and an STT backend (`faster-whisper` or `Deepgram`) before opening the overlay.

## What It Does

- shows a floating always-on-top overlay
- captures microphone audio and optional BlackHole system audio in the renderer
- streams PCM to the main process for speech recognition
- supports local `faster-whisper` and cloud `Deepgram`
- captures full-screen context for AI requests
- supports local `Ollama` and cloud `Gemini`
- persists settings and usage in SQLite

## Run Locally

```bash
npm install
npm start
```

Useful commands:

```bash
npm run build
npm run dist:mac
npm run dist:win
```

If Electron native modules drift after packaging, rebuild them with:

```bash
npx electron-builder install-app-deps
```

## Requirements

Choose one LLM path:

- `Ollama`: local Ollama running and the selected model pulled
- `Gemini`: internet access plus a Gemini API key

Choose one STT path:

- `faster-whisper`: Python 3.8+ plus `pip install faster-whisper`
- `Deepgram`: internet access plus a Deepgram API key

Optional for system audio transcription on macOS:

- `BlackHole 2ch`

The app also needs macOS microphone and screen recording permissions.

## Project Structure

```text
electron/
  ipc/                 Main-process IPC handlers
  providers/           LLM/STT provider implementations
  services/            Main-process orchestration, persistence, routing
  main.ts              Electron bootstrap and window lifecycle
  preload.ts           Safe renderer bridge
  setupWindow.ts       First-run / per-launch provider setup window

renderer/
  components/          Overlay and setup UI pieces
  hooks/               Renderer-side state and IPC hooks
  types/               Shared renderer-facing types
  App.tsx              Overlay application shell
  SetupApp.tsx         Provider setup UI

src/
  shared.ts            IPC channel constants and shared dimensions
  config.ts            Centralized runtime defaults and magic numbers

scripts/
  transcribe_server.py Python faster-whisper worker

public/
  audioWorklet.js      PCM extraction worklet

native-module/
  Rust audio capture module kept for future/native experimentation
```

## Environment Variables

Optional:

- `GEMINI_API_KEY`
- `DEEPGRAM_API_KEY`
- `CODEX_BIN`

Most current provider settings are persisted in SQLite through the setup UI instead of being read from env on every launch.

## Active Architecture

- Setup window launches first and saves provider settings.
- The overlay opens after setup completes.
- Renderer audio capture sends PCM chunks over IPC.
- The active STT provider is selected through `electron/services/providerRegistry.ts`.
- AI requests are routed through the active LLM provider from the same registry.
- Screenshots are captured in the main process and attached when the chosen LLM supports vision.

## Packaging

The repo is configured for `electron-builder`.

- Apple Silicon DMG: `npm run dist:mac`
- Windows installer: `npm run dist:win`

Packaged builds include:

- Electron app bundle
- Python transcription script
- native module resources
- macOS entitlements for microphone access
