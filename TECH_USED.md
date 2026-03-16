# Natively — Tech Used and Architecture

This document describes the current project as it exists in this repository right now.

It covers:

- the main technologies used
- what each technology is used for
- how the app is structured
- how audio is captured and transcribed
- how screen/video context is captured and shown
- how AI requests flow through the system

## Product Summary

Natively is a local-first Electron overlay assistant for live meetings, interviews, and screen-based problem solving.

The current app does four core things:

- renders a floating transparent HUD overlay
- captures screen context
- captures live audio and converts it into transcript text
- sends transcript + screenshot context into Codex and streams the answer back into the overlay

## Tech Stack

### Desktop Shell

- Electron

Used for:

- frameless transparent always-on-top window
- IPC between renderer and main process
- desktop/screen capture
- global shortcuts
- packaging as a desktop app

Why it is used:

- the product needs capabilities a normal browser app does not have, especially transparent overlay windows, desktop capture, and native packaging

### Frontend

- React 18
- TypeScript
- Vite

Used for:

- renderer UI and component structure
- typed state management and IPC contracts
- fast local development/build

Why they are used:

- React keeps the overlay UI modular
- TypeScript reduces IPC/state bugs across the Electron boundary
- Vite gives a fast dev loop and straightforward build output

### Data and Persistence

- SQLite via `better-sqlite3`

Used for:

- app settings
- session/conversation history
- usage tracking

Why it is used:

- local desktop app state is small and structured
- `better-sqlite3` is simple, fast, and synchronous, which works well in Electron main

### AI

- Codex CLI

Used for:

- generating answers and assistant output

Why it is used:

- this repo is intentionally Codex-only right now
- it avoids maintaining multiple hosted provider SDK paths in the current codebase
- it supports local CLI-authenticated workflows

### Transcription

- Python `faster-whisper`

Used for:

- live speech-to-text
- interim transcript pass
- final transcript pass

Why it is used:

- keeps transcript local rather than cloud-dependent
- offers better control over latency/accuracy tradeoffs
- integrates cleanly through a long-lived Python worker process

### Audio Capture

- Browser `getUserMedia`
- `AudioContext`
- `AudioWorklet`
- `ScriptProcessorNode` fallback

Used for:

- capturing microphone audio
- opening BlackHole as an audio input when available
- mixing audio streams in the renderer
- converting browser audio into PCM chunks for the main process

Important current state:

- the repo still contains a compiled `native-module/`
- but the active audio path in the current commit is the renderer-side Web Audio pipeline, not the later standalone Rust capture binary experiment

### Screen Capture

- `navigator.mediaDevices.getDisplayMedia`
- Electron `desktopCapturer`

Used for:

- live visual preview/context updates in the renderer
- full-screen screenshot capture in the main process
- selected-region screenshot capture in the main process

### UI Rendering Helpers

- `react-markdown`
- `react-syntax-highlighter`
- `lucide-react`
- `@tanstack/react-query`

Used for:

- rendering markdown answers
- code block syntax highlighting
- consistent iconography
- async mutation handling for AI requests

## High-Level Architecture

The app is split into three main layers:

1. Electron main process
2. Electron preload bridge
3. React renderer

### 1. Main Process

Main entry:

- [electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)

Responsibilities:

- creates the overlay window
- configures media permissions
- registers IPC handlers
- sets up screenshot capture
- wires the Codex window reference
- registers keyboard shortcuts
- loads and persists settings through SQLite

### 2. Preload Bridge

Bridge file:

- [electron/preload.ts](/Users/sumedh/cluely-natively/electron/preload.ts)

Responsibilities:

- exposes a safe `window.electronAPI`
- maps renderer requests to IPC channels
- exposes transcript, AI, screenshot, window, and settings APIs to React

### 3. Renderer

Main renderer root:

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

Responsibilities:

- renders the overlay UI
- starts/stops audio capture
- manages live transcript and AI streaming state
- maintains live screen-preview context
- shows diagnostics, transcript, quick actions, and answer card

## Current File-Level Architecture

### Main Process IPC

- [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)
  - starts/stops transcript service
  - receives PCM chunks from renderer
  - forwards transcript events back to renderer

- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)
  - accepts AI requests from renderer
  - attaches screenshot context
  - persists messages and usage

- [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)
  - captures full-screen screenshots
  - captures selected-screen regions
  - supports hiding the overlay during capture

- [electron/ipc/windowHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/windowHandlers.ts)
  - handles hide/show/move/resize behavior for the overlay window

### Main Process Services

- [electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)
  - runs Codex CLI
  - streams stdout chunks to the renderer
  - prepares temporary screenshot image files for Codex

- [electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts)
  - builds prompts
  - injects transcript and screen context
  - routes all AI requests through Codex

- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)
  - buffers PCM audio
  - performs fast and full flush scheduling
  - writes WAV files
  - sends work to the Python transcript server
  - emits interim/final/status/error events

- [electron/services/database.ts](/Users/sumedh/cluely-natively/electron/services/database.ts)
  - owns SQLite schema and persistence

### Transcript Worker

- [scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)

Responsibilities:

- loads `faster-whisper`
- accepts `FAST:` and `FULL:` WAV jobs on stdin
- emits `INTERIM:` and `FINAL:` transcript text on stdout
- filters junk and low-quality hallucinations

## Audio Capture Flow

The current audio path is renderer-driven.

### Step-by-step flow

1. The renderer starts audio capture in [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx).
2. It calls `navigator.mediaDevices.getUserMedia(...)` for microphone audio.
3. On macOS, it also enumerates audio input devices and tries to open BlackHole as an input stream.
4. The renderer creates an `AudioContext` at `16000Hz`.
5. It loads [public/audioWorklet.js](/Users/sumedh/cluely-natively/public/audioWorklet.js) into the audio graph.
6. Microphone and BlackHole streams are connected to the audio worklet.
7. The worklet emits PCM frames back to the renderer.
8. The renderer sends those PCM chunks through `window.electronAPI.pushAudioChunk(...)`.
9. `audioHandlers.ts` receives the chunks in the main process.
10. The chunks are forwarded to `LocalTranscriptService.pushPCM(...)`.
11. `localTranscript.ts` buffers the audio and periodically flushes WAV files.
12. The WAV paths are sent to the Python transcript server.
13. Python returns interim/final transcript text.
14. The main process forwards transcript events to the renderer.
15. The renderer updates the transcript ticker.

### Audio technologies involved

- Browser `getUserMedia`
- `AudioContext`
- `AudioWorklet`
- PCM over Electron IPC
- main-process buffering and WAV writing
- Python `faster-whisper`

### Current audio design tradeoff

Benefits:

- works entirely within the current Electron app
- allows renderer-side stream inspection and diagnostics
- can combine mic and BlackHole in one renderer graph

Costs:

- more moving parts across browser audio APIs
- PCM must cross IPC to the main process
- more latency and fragility than a fully native capture pipeline

## Transcript Pipeline

The transcript service uses a two-pass model.

### Fast pass

- flush interval: short
- emits interim transcript quickly
- lower-latency, lower-confidence

### Full pass

- longer buffer window
- emits final transcript text
- better quality and more stable wording

This is why the transcript UI can show text quickly while still correcting itself shortly after.

### Main transcript logic

Implemented in:

- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)
- [renderer/hooks/useAudio.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAudio.ts)

What it does:

- interim text is shown immediately
- final text replaces/extends the confirmed transcript
- duplicate and overlapping segments are filtered in the renderer

## Video / Screen Capture Flow

There are two different screen-related flows in the app:

1. live screen context capture for the assistant
2. explicit screenshot capture for user-triggered or AI-triggered image context

### A. Live screen context capture

This happens in the renderer.

Flow:

1. [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx) calls `getDisplayMedia(...)`
2. the selected display stream is attached to a hidden `<video>`
3. a hidden `<canvas>` draws frames from that video every second
4. the canvas is encoded to JPEG base64
5. the latest base64 string is stored in renderer state as current screen context
6. AI requests use that cached frame when available

What this is used for:

- giving the assistant current on-screen context without waiting for a new explicit screenshot each time

### B. Explicit screenshot capture

This happens in the main process.

Full screenshot flow:

1. renderer requests `captureFullScreen`
2. [screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts) uses Electron `desktopCapturer`
3. it captures the primary display thumbnail
4. it returns the PNG as base64

Selective screenshot flow:

1. renderer requests `captureSelectiveScreen`
2. main process creates a transparent fullscreen selection overlay window
3. the user drags a rectangle
4. the main process crops the captured display image to that region
5. the cropped PNG is returned as base64

Overlay visibility behavior:

- if `includeOverlayInScreenshots` is false, the overlay window is briefly hidden before screenshot capture
- then it is restored after capture

## How Screen Context Is Displayed

The live screen context is not continuously shown as a large visible video element.

Instead:

- it is captured in the background
- cached as base64 context
- optionally shown in screenshot-related UI when needed
- passed into AI requests as screenshot context

So the app uses the display stream mainly as an input/context source, not as an always-visible live video panel.

## AI Request Flow

The AI flow is:

1. user triggers a quick action or custom request
2. renderer sends a typed AI payload to main
3. [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts) optionally captures a screenshot if no cached screenshot is present
4. [electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts) builds the final prompt
5. [electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts) runs Codex CLI
6. Codex stdout is streamed back over IPC as `ai-chunk`
7. the renderer drains those chunks character-by-character for a smoother typing effect
8. final text is persisted in SQLite

## What the Native Module Is Used For Right Now

The repo includes:

- [native-module/](/Users/sumedh/cluely-natively/native-module)

It is built during install and packaged in the app config.

Current practical status in this commit:

- the native module exists
- it is part of the repo/build toolchain
- but the active transcript audio path is still the renderer-side Web Audio pipeline

So it is present in the project, but it is not the primary capture path described above.

## Packaging and Build Tooling

Build tools:

- TypeScript compiler
- Vite
- Electron Builder
- `@napi-rs/cli`

Scripts:

- `npm start` — dev launcher
- `npm run build` — TS + renderer + Electron build
- `npm run dist` — package app
- `npm run build:native` — build the N-API Rust module

Current packaging notes:

- Python transcript worker scripts are included as `extraResources`
- the native module `.node` binary is included in packaged output

## Current Strengths of This Architecture

- local-first
- no cloud STT dependency
- simple Codex-only AI path
- good separation between renderer UI and main-process orchestration
- SQLite-based local persistence
- explicit screen context pipeline

## Current Architectural Constraints

- audio capture still depends on browser media APIs in the renderer
- mic + BlackHole capture quality depends on system routing and Chromium media behavior
- screen context uses periodic frame capture, not a true continuous analysis pipeline
- the native module is present but not the active audio backbone in this commit

## Most Important Files to Read First

If someone is onboarding into the current codebase, these are the fastest files to inspect:

- [electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)
- [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts)
- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)
- [scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)
- [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)
- [electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)
- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
- [renderer/hooks/useAudio.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAudio.ts)

## Bottom Line

The current project is an Electron + React overlay app with:

- renderer-side audio capture
- main-process transcript orchestration
- Python `faster-whisper` transcription
- Electron-based screenshot capture
- Codex CLI answer generation
- SQLite local persistence

Audio is captured in the renderer, transcribed through the main process and Python worker, and then shown in the overlay.

Screen/video context is captured in two ways:

- live display stream snapshots in the renderer for cached visual context
- on-demand screenshots in the main process for explicit image capture

That is the architecture actually present in the current repository state.
