# Natively Architecture

This document describes the current architecture of this repository as it exists now, with an emphasis on:

- what is being used
- where it is used
- how data flows through the app
- why these choices were made instead of nearby alternatives

It also calls out code that still exists in the repo but is not the active runtime path.

## Executive Summary

Natively is a desktop overlay assistant built on Electron. The active system is:

- Electron main process for native windowing, IPC, persistence, screenshots, and backend orchestration
- React renderer for the overlay UI and browser-side audio capture
- Deepgram streaming WebSocket transcription through a Python worker
- OpenRouter for streamed LLM responses
- SQLite via `better-sqlite3` for local settings, message history, and usage tracking

The current design is intentionally hybrid:

- browser APIs are used where they are already good enough and low-friction, especially audio capture in the renderer
- Electron main owns anything security-sensitive, native, or stateful
- external AI/STT providers are isolated behind service layers in main and Python rather than called directly from the renderer

## System Layers

### 1. Electron Main Process

Primary file:

- [electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)

What it does:

- creates the transparent always-on-top overlay window
- configures media and display capture permissions
- registers all IPC handlers
- initializes SQLite
- wires screenshot capture
- routes AI requests
- starts and stops transcript handling indirectly through IPC

Why Electron main owns this:

- window control and desktop capture are native capabilities, not renderer concerns
- API keys and provider calls are safer in main than in the browser context
- message persistence and provider orchestration are simpler when centralized

Why not do more in the renderer:

- the renderer is untrusted compared to main
- direct provider calls from React would expose credentials and duplicate business logic
- screenshot and window control are cleaner over IPC than through mixed renderer hacks

### 2. Preload Bridge

Primary file:

- [electron/preload.ts](/Users/sumedh/cluely-natively/electron/preload.ts)

What it does:

- exposes a controlled `window.electronAPI`
- maps typed frontend actions onto fixed IPC channels
- subscribes renderer listeners to transcript, AI, screenshot, and window events

Why this is used:

- Electron with `contextIsolation: true` is the safer default
- preload gives a narrow API surface instead of full Node access in the renderer

Why not enable full Node integration in the renderer:

- larger attack surface
- harder to reason about boundaries
- encourages leaky architecture where UI code starts owning backend concerns

### 3. React Renderer

Primary files:

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
- [renderer/hooks/useAI.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAI.ts)
- [renderer/hooks/useAudio.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAudio.ts)
- [renderer/hooks/useTranscript.ts](/Users/sumedh/cluely-natively/renderer/hooks/useTranscript.ts)

What it does:

- renders the overlay UI
- manages button interactions
- starts/stops audio capture
- renders transcript and AI answer streams
- maintains screenshot preview state

Why React is used here:

- overlay UI is stateful and component-heavy
- transcript, streaming answer text, settings, and preview state fit React well

Why not use plain Electron HTML:

- state and event coordination would become brittle quickly
- React hooks make streamed UI state and cleanup logic much easier

## Active Technologies And Why They Were Chosen

### Electron

Used in:

- [electron/main.ts](/Users/sumedh/cluely-natively/electron/main.ts)
- all IPC handlers under [electron/ipc](/Users/sumedh/cluely-natively/electron/ipc)

Used for:

- frameless transparent overlay
- always-on-top window behavior
- desktop and region screenshots
- secure preload bridge
- packaging

Why Electron instead of a web app:

- the product needs native window control and screen capture
- browser-only apps cannot deliver the same overlay behavior cleanly

Why Electron instead of Tauri:

- Electron’s desktop capture and BrowserWindow APIs are more mature for this style of HUD app
- the codebase already leans on Electron IPC and preload conventions
- React + Electron tooling is simpler for this current team velocity

Tradeoff:

- heavier memory footprint than Tauri
- larger packaged app size

### React + TypeScript + Vite

Used in:

- all files under [renderer](/Users/sumedh/cluely-natively/renderer)

Used for:

- UI composition
- hook-driven state handling
- typed contracts between renderer and main
- fast development builds

Why this instead of vanilla JS:

- too much streaming and derived state for ad hoc DOM code
- type safety matters because IPC payloads and transcript state are easy to break

Why Vite instead of Webpack:

- faster local iteration
- simpler config for a mixed renderer + Electron build

### SQLite via `better-sqlite3`

Used in:

- [electron/services/database.ts](/Users/sumedh/cluely-natively/electron/services/database.ts)

Stores:

- settings
- session messages
- token usage

Why SQLite:

- local-first desktop app data is small and relational
- no server dependency
- durable, queryable, and easy to inspect

Why `better-sqlite3` instead of async SQLite clients:

- main-process usage is small and synchronous reads are acceptable
- lower complexity than async wrappers for this scale

Why not JSON files:

- settings alone could fit JSON, but conversation history and usage tracking fit tables better
- SQLite handles schema growth more cleanly

### OpenRouter for LLM inference

Used in:

- [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts)
- [electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts)

Actual role:

- despite the filename `gemini.ts`, the active implementation is OpenRouter
- responses stream back over OpenAI-compatible SSE
- screenshots are attached as `image_url` content parts when present
- the code currently tries a fallback chain of free models

Why this instead of Codex CLI:

- lower startup friction than spawning a CLI process for every request
- no local CLI auth dependency in the answer path
- easier multimodel fallback behavior

Why this instead of direct Gemini API:

- broader model choice
- easier provider-level fallback
- one OpenAI-style interface for multiple free models

Why this instead of direct renderer fetch calls:

- API keys stay in main
- consistent IPC events `ai-chunk`, `ai-complete`, and `ai-error`
- easier prompt and screenshot routing

Tradeoffs:

- free-tier models are rate-limited and unstable
- model availability changes frequently
- current code still has stale naming (`runGemini`, `aiProvider: 'codex'` in types/defaults), which is architectural debt

### Deepgram streaming STT through Python

Used in:

- [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts)
- [scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py)

What happens:

- main buffers PCM
- writes temporary WAVs
- passes `FAST:` or `FULL:` file paths to the Python worker over stdin
- Python reads WAV PCM, streams it into Deepgram over WebSocket
- Python emits `INTERIM:` and `FINAL:` lines to stdout
- main converts those to EventEmitter events
- audio IPC forwards them back to the renderer

Why this instead of local Whisper right now:

- Deepgram provides lower perceived latency for live interim speech
- no model download or CPU-heavy inference in the app process

Why a Python worker instead of calling Deepgram directly from Node main:

- the transcription worker was already process-isolated
- Python offered a fast iteration path for provider changes
- keeping transcription out of main reduces blast radius when the provider connection misbehaves

Why not a direct raw PCM WebSocket from Electron main:

- that would remove WAV temp files and likely be cleaner long term
- but the current implementation stayed closer to the existing worker protocol
- the team chose a lower-risk incremental migration over a full rewrite

Why not Sarvam REST anymore:

- REST chunk uploads had high latency and queueing overhead
- short chunk accuracy and throughput were worse than desired
- the app needed better live interim behavior

Tradeoffs:

- Python is an extra runtime dependency
- writing WAV temp files is slower and less elegant than direct streaming
- keeping the protocol line-based with `FAST:` and `FULL:` preserves compatibility but is not the cleanest design

### Renderer-side Web Audio capture

Used in:

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)
- [renderer/hooks/useAudio.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAudio.ts)
- [public/audioWorklet.js](/Users/sumedh/cluely-natively/public/audioWorklet.js)

What it does:

- opens microphone via `getUserMedia`
- optionally opens BlackHole if found as an audio input on macOS
- uses an `AudioContext` at 16kHz
- loads an `AudioWorklet` to emit PCM
- forwards PCM chunks to main over IPC

Why this instead of the Rust native audio path:

- the Rust/native path exists in the repo but is not the active runtime path
- browser audio APIs are simpler to iterate on during development
- no native child-process packaging complexity in the current active flow

Why this instead of main-process capture:

- browser media APIs are already integrated with permissions and device enumeration
- mixing mic plus BlackHole in the renderer is straightforward

Why not rely only on `getDisplayMedia` system audio:

- macOS loopback capture is inconsistent compared with BlackHole as an input device
- BlackHole gives a more explicit route for system audio ingestion

Tradeoffs:

- renderer-side capture is more fragile than a dedicated native audio daemon
- browser APIs on macOS can be inconsistent around device selection
- current code still carries native-module baggage that is no longer the main path

### Electron desktop capture for screenshots

Used in:

- [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)

What it does:

- full-screen screenshot via `desktopCapturer`
- optional selective-region capture via a temporary transparent overlay window
- optional hiding of the main HUD before capture so the overlay does not contaminate screenshots

Why this instead of constant screen video streaming into main:

- most AI requests only need a still image
- full-motion screen streaming would be heavier and more complex
- screenshots are cheaper to send to AI providers than video

Why not use renderer-only screenshot logic:

- main already owns window visibility and desktop capture permissions
- selective capture needs a temporary native overlay window

## End-to-End Runtime Flows

### AI Answer Flow

1. User clicks a quick action in the renderer.
2. [renderer/hooks/useAI.ts](/Users/sumedh/cluely-natively/renderer/hooks/useAI.ts) sends an `AIPayload` via preload.
3. [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts) receives `send-ai-message`.
4. Main ensures a screenshot exists, capturing one if necessary.
5. [electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts) builds a prompt from transcript plus screenshot context.
6. [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts) sends the request to OpenRouter.
7. SSE deltas stream back on `ai-chunk`.
8. Renderer appends chunks to the answer view.
9. `ai-complete` closes the stream and the final message is persisted.

Why this design instead of one huge synchronous response:

- streaming lowers perceived latency
- renderer can render useful partial text immediately
- failures are easier to observe and debug at the chunk level

### Transcript Flow

1. Renderer starts audio capture.
2. `getUserMedia` opens mic, and BlackHole if present.
3. `AudioWorklet` emits PCM buffers.
4. Preload forwards PCM buffers to `push-audio-chunk`.
5. [electron/ipc/audioHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/audioHandlers.ts) pushes PCM into `LocalTranscriptService`.
6. [electron/services/localTranscript.ts](/Users/sumedh/cluely-natively/electron/services/localTranscript.ts) buffers audio, flushes WAV chunks, and passes paths to the Python worker.
7. [scripts/transcribe_server.py](/Users/sumedh/cluely-natively/scripts/transcribe_server.py) streams audio to Deepgram.
8. Python prints `INTERIM:` and `FINAL:` lines.
9. `LocalTranscriptService` emits `interim` and `transcript` events.
10. Audio IPC maps those to `transcript-interim` and `transcript-update`.
11. [renderer/hooks/useTranscript.ts](/Users/sumedh/cluely-natively/renderer/hooks/useTranscript.ts) maintains `interimText` and capped `finalLines`.
12. [renderer/components/TranscriptPanel.tsx](/Users/sumedh/cluely-natively/renderer/components/TranscriptPanel.tsx) renders the horizontal ticker.

Why this design instead of direct renderer transcription:

- API keys and provider connectivity stay out of the renderer
- transcript protocol is insulated from UI changes
- main can own buffering, silence logic, and worker lifecycle

### Screenshot Flow

1. Renderer requests full-screen or selective capture.
2. Main optionally hides the overlay first.
3. `desktopCapturer` captures the primary display.
4. For selective capture, a temporary selection overlay collects a rectangle.
5. Main crops the native image and returns base64 PNG.
6. Renderer shows the preview and AI calls include that base64 image.

## What Exists But Is Not The Main Runtime Path

These files matter as alternatives, but they are not the primary active path:

- [electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)
  - old or fallback AI path using Codex CLI
- [electron/services/sarvam.ts](/Users/sumedh/cluely-natively/electron/services/sarvam.ts)
  - previous text-only provider experiment
- `native-module/`
  - older native audio capture integration

Why these still exist:

- the repo has been evolving through provider and capture experiments
- keeping prior implementations on disk lowered rollback risk

Why this is not ideal:

- naming is now misleading in places
- unused implementations add cognitive load
- runtime choice is harder to infer without reading several files

## Architectural Strengths

- clear Electron main vs renderer separation
- preload bridge keeps IPC explicit
- SQLite gives local durability without extra infrastructure
- transcript and AI are streamed rather than batch-only
- screenshot flow is provider-agnostic and easy to reuse

## Architectural Weaknesses

- naming drift: `gemini.ts` now fronts OpenRouter, not Gemini
- settings and types still imply Codex as the active provider
- Python worker plus WAV temp files is more moving parts than necessary
- renderer-side audio capture is easier to ship, but less robust than a clean native capture service
- debug logs from recent diagnosis work are currently mixed into production paths

## Recommended Future Simplifications

### 1. Rename provider files to match reality

Recommended:

- rename `gemini.ts` to `openrouter.ts`
- rename `runGemini` to `runOpenRouter`

Why:

- current names are misleading
- this is now the single most confusing part of the codebase

### 2. Decide whether Codex is dead code or fallback

If dead:

- remove [electron/services/codex.ts](/Users/sumedh/cluely-natively/electron/services/codex.ts)

If fallback:

- wire explicit provider selection in settings and router

### 3. Replace WAV temp files with direct streaming from Node to provider

Why:

- lower latency
- fewer temp files
- simpler failure handling

### 4. Decide between renderer audio and native audio

Current compromise is workable, but long term the app should choose one:

- renderer capture for speed of iteration
- native capture for robustness and packaging consistency

## Alternatives Compared To The Current Stack

### AI provider

Current:

- OpenRouter with free-model fallback

Alternatives:

- Codex CLI
- direct Gemini API
- local Ollama

Why current wins right now:

- easiest streaming path without local model management
- screenshot-compatible on supported models
- fallback chain reduces outages

Why it may lose later:

- free-tier instability
- model churn

### STT provider

Current:

- Deepgram streaming via Python worker

Alternatives:

- local Faster Whisper
- Sarvam REST
- direct Node WebSocket client

Why current wins right now:

- lower latency than the recent REST approach
- better live transcription behavior

Why it may lose later:

- extra Python dependency
- unnecessary process boundary if a stable Node client is adopted

### Audio capture

Current:

- renderer `getUserMedia` + `AudioWorklet` + optional BlackHole

Alternatives:

- Rust binary child process
- N-API native audio callbacks
- pure display-media loopback capture

Why current wins right now:

- fastest to iterate
- easiest to debug in the browser dev loop

Why it may lose later:

- less deterministic than a dedicated native audio pipeline
- trickier on macOS edge cases

### Persistence

Current:

- SQLite with `better-sqlite3`

Alternatives:

- JSON files
- IndexedDB
- remote backend

Why current wins right now:

- durable
- simple
- local-first
- easy reporting and history queries
