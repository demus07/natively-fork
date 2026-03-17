# WORKING.MD

## Purpose

This file is a working map of the current application in `/Users/sumedh/cluely-natively`.
It describes:

- what the app does
- which architecture is active right now
- how audio, transcript, screenshots, and LLM responses flow
- which files are important
- which files are present but not active in the current runtime path

This is written against the current codebase state, not historical intent.

## Current Active Architecture

### High-level summary

The app is an Electron desktop overlay with a React renderer.

Current live stack:

- UI shell: Electron + React + Vite
- Active LLM: local Ollama-compatible server
- Active model: `qwen3.5:35b`
- Active STT: browser audio capture + Python `faster-whisper`
- Screenshot capture: Electron `desktopCapturer`
- Persistence: SQLite via `better-sqlite3`

### Important naming mismatch

Some file names no longer match what they actually do:

- `electron/services/gemini.ts`
  - active file
  - not using Gemini
  - currently calls a local Ollama-compatible endpoint
- `renderer/types/index.ts`
  - still types `aiProvider` as `'codex'`
  - current runtime LLM is not Codex
- `electron/services/nativeAudio.ts`
  - present in repo
  - currently not used by the active audio path

## End-to-end runtime flow

### 1. App startup

File:

- `electron/main.ts`

What it does:

- waits for Electron app readiness
- grants media and display capture permissions in the Electron session
- requests microphone access on macOS
- initializes SQLite database
- loads cached settings into memory
- creates the transparent always-on-top overlay window
- registers IPC handlers for:
  - window control
  - audio / transcript
  - screenshots
  - AI requests

### 2. Overlay UI startup

Main renderer files:

- `renderer/main.tsx`
- `renderer/App.tsx`

What happens:

- React mounts the overlay app
- settings are loaded from main process
- screen preview capture starts
- transcript backend is started via IPC
- renderer browser audio capture starts
- transcript and AI listeners attach to IPC events

### 3. Audio capture

Current active audio path:

- browser `getUserMedia`
- optional BlackHole device capture on macOS
- `AudioContext`
- `AudioWorklet`
- PCM posted to main process via IPC

Files:

- `renderer/App.tsx`
- `public/audioWorklet.js`
- `electron/ipc/audioHandlers.ts`
- `electron/services/localTranscript.ts`
- `scripts/transcribe_server.py`

### 4. Speech-to-text

Current active STT path:

- renderer produces 16 kHz mono PCM
- main process buffers PCM into WAV snapshots and full chunks
- Python worker transcribes WAV files with `faster-whisper`
- worker writes `INTERIM:` and `FINAL:` lines to stdout
- main process emits transcript IPC events to renderer

### 5. Screenshot context

Current screenshot path:

- renderer maintains a live screen context image for AI requests
- main process can also capture full or selective screenshots

Files:

- `renderer/App.tsx`
- `electron/ipc/screenshotHandlers.ts`

### 6. AI request flow

Current AI path:

- renderer sends request payload with transcript + screenshot
- main process builds final prompt
- `runGemini()` is called
- `runGemini()` sends request to local Ollama-compatible endpoint
- streamed tokens come back over SSE-style OpenAI-compatible chunks
- chunks are forwarded over IPC to renderer

Files:

- `renderer/hooks/useAI.ts`
- `electron/ipc/aiHandlers.ts`
- `electron/services/aiRouter.ts`
- `electron/services/gemini.ts`

## Active files and what each one does

### Electron main process

#### `electron/main.ts`

Main Electron bootstrap.

Responsibilities:

- app startup
- permission handling
- overlay window creation
- IPC registration
- settings/history usage handlers
- global shortcut registration

Notable behavior:

- overlay is transparent, frameless, always on top
- uses `preload.js`
- logs renderer debug messages forwarded from the renderer

#### `electron/preload.ts`

Secure bridge between renderer and Electron main.

Exposes `window.electronAPI` with methods for:

- audio start/stop/chunk push
- screenshots
- AI message send
- transcript listeners
- settings and stats access
- window controls

Current audio behavior:

- `startAudioCapture()` invokes `start-audio-capture`
- `pushAudioChunk()` sends PCM bytes to main

### IPC handlers

#### `electron/ipc/audioHandlers.ts`

Connects transcript service to renderer IPC.

Responsibilities:

- starts transcript backend
- forwards renderer PCM chunks to transcript service
- forwards transcript service events back to renderer

Renderer-facing events sent:

- `transcript-interim`
- `transcript-update`
- `transcript-status`
- `transcript-error`

Current mode:

- browser PCM path only
- native Rust capture is not started here anymore

#### `electron/ipc/aiHandlers.ts`

Handles `send-ai-message`.

Responsibilities:

- optionally captures screenshot if needed
- calls `routeAIRequest(...)`
- writes final AI message to conversation history
- forwards AI errors to renderer

Note:

- this file is in the active request path
- it is not the LLM implementation itself

#### `electron/ipc/screenshotHandlers.ts`

Handles full-screen and selective screenshot capture.

Responsibilities:

- captures primary display using `desktopCapturer`
- can temporarily hide overlay before capture
- supports selection overlay window for cropped screenshots

Delay behavior:

- when overlay should be excluded, main window hides
- waits `120ms`
- captures screen
- restores overlay afterward

#### `electron/ipc/windowHandlers.ts`

Window control handlers.

Responsibilities:

- show/hide/move overlay
- opacity updates
- content size updates
- app quit
- shortcut registration

### Services

#### `electron/services/localTranscript.ts`

Active transcript orchestrator.

Current implementation:

- `EventEmitter` service
- spawns `scripts/transcribe_server.py`
- accepts PCM via `pushPCM(Buffer)`
- buffers PCM in memory
- writes WAV files to temp directory
- sends FAST and FULL WAV file paths to Python worker

Public methods:

- `start()`
- `stop()`
- `pushPCM(chunk)`
- `setLanguage(lang)`
- `isRunning()`
- `isServerReady()`
- `getServerError()`
- `getLastTranscript()`

Emitted events:

- `interim`
- `transcript`
- `error`
- `status`

Important constants:

- `SAMPLE_RATE = 16000`
- `BYTES_PER_SAMPLE = 2`
- `FAST_FLUSH_MS = 1500`
- `FULL_FLUSH_MS = 5000`
- `MIN_FAST_BUFFER_MS = 800`
- `MIN_CHUNK_MS = 5000`
- `MAX_CHUNK_MS = 8000`
- `SILENCE_FLUSH_MS = 800`

What this means in practice:

- interim results come from snapshot WAVs
- final results come from longer full chunks
- silence or max window forces a flush

#### `scripts/transcribe_server.py`

Active Python STT worker.

Current implementation:

- loads `.env`
- reads `WHISPER_MODEL`, `WHISPER_LANGUAGE`, `WHISPER_COMPUTE`, `WHISPER_DEVICE`
- loads `faster_whisper.WhisperModel`
- prints `READY` when initialized
- reads stdin lines like:
  - `FAST:/tmp/file.wav`
  - `FULL:/tmp/file.wav`
- transcribes WAV files
- deletes WAV files after use
- prints:
  - `INTERIM:<text>`
  - `FINAL:<text>`

Current decoding behavior:

- FAST mode:
  - `beam_size=1`
  - `best_of=1`
- FULL mode:
  - `beam_size=5`
  - `best_of=5`

#### `electron/services/gemini.ts`

Active LLM transport despite the file name.

Current implementation:

- calls local Ollama-compatible endpoint:
  - `http://192.168.29.234:11434/v1/chat/completions`
- active model:
  - `qwen3.5:35b`
- exports:
  - `runGemini(...)`
  - `supportsVision = true`

Request behavior:

- sends OpenAI-compatible `chat/completions` payload
- includes text plus optional `image_url`
- sets:
  - `thinking: false`
  - `options.think = false`
  - `options.num_ctx = 8192`
  - `max_tokens = 2048`

Streaming behavior:

- reads streamed lines prefixed with `data: `
- parses `choices[0].delta.content`
- filters `<think>...</think>` blocks
- sends IPC:
  - `ai-chunk`
  - `ai-complete`
  - `ai-error`

Reliability behavior:

- 30 second `AbortController` timeout
- custom unreachable-host and timeout messages

#### `electron/services/aiRouter.ts`

Builds the actual prompt sent to the LLM.

Responsibilities:

- defines the system prompt
- formats transcript context
- builds action-specific prompts:
  - answer
  - shorten
  - recap
  - followup
  - custom
- calls `runGemini(...)`

Important behavior:

- transcript context is capped to the last `Math.min(rollingContextSize, 8)` segments
- screenshot is assumed to be attached image context

#### `electron/services/database.ts`

SQLite persistence layer.

Responsibilities:

- opens database in Electron userData directory
- creates tables:
  - `messages`
  - `settings`
  - `sessions`
  - `usage`
- loads and caches settings
- saves conversation history
- tracks usage counters

Default settings currently include:

- `aiProvider: 'codex'`
- `whisperModel: 'base.en'`
- `rollingContextSize: 20`
- `includeOverlayInScreenshots: false`

Important mismatch:

- settings still default `aiProvider` to `'codex'`
- runtime currently uses `gemini.ts` which now talks to Ollama

#### `electron/services/codex.ts`

Present in repo, not current active LLM path.

Purpose:

- previous Codex CLI / OAuth route

Current state:

- kept as an alternative / older path
- not the current request path

#### `electron/services/sarvam.ts`

Present in repo, not active.

Purpose:

- older alternative STT / AI-related integration path

#### `electron/services/nativeAudio.ts`

Present in repo, currently not active.

Purpose:

- bridge to Rust native module
- resample native PCM and forward to transcript service

Current state:

- not used by `audioHandlers.ts`
- browser audio path is active instead

### Renderer

#### `renderer/main.tsx`

React entrypoint. Mounts the app and providers.

#### `renderer/App.tsx`

Main UI orchestration file.

Responsibilities:

- starts audio capture on boot
- starts live screen preview capture
- keeps latest screen image for AI requests
- collects transcript and AI output into UI state
- wires quick actions
- manages diagnostics
- controls title bar actions and settings modal

Important active behavior:

- uses browser `startAudioCapture(...)` fallback path
- searches for BlackHole device on macOS
- captures live screen frames every `200ms`
- compresses screenshot preview with `canvas.toDataURL('image/jpeg', 0.5)`

Audio capture inside this file:

- mic capture:
  - `echoCancellation: false`
  - `noiseSuppression: false`
  - `autoGainControl: false`
  - `sampleRate: 16000`
  - `channelCount: 1`
- BlackHole capture:
  - opened if an `audioinput` device label includes `blackhole`
- mixes streams in an `AudioContext`
- pushes PCM via worklet or `ScriptProcessor` fallback

#### `public/audioWorklet.js`

PCM extractor worklet.

Responsibilities:

- receives float audio samples
- converts to signed 16-bit PCM
- buffers and flushes chunks to renderer

Current flush behavior:

- `_flushEvery = 800`
- at 16 kHz this is roughly `50ms` chunks

#### `renderer/hooks/useAudio.ts`

Simple recording state hook.

Responsibilities:

- starts transcript backend via preload
- stops transcript backend
- exposes `isRecording`

#### `renderer/hooks/useTranscript.ts`

Transcript store hook.

Responsibilities:

- attaches one-time IPC listeners
- stores:
  - final transcript lines
  - current interim text
- exposes current transcript snapshot to components

#### `renderer/hooks/useAI.ts`

Thin mutation wrapper around `window.electronAPI.sendMessage(...)`.

#### `renderer/hooks/useSettings.ts`

Loads and saves settings through preload.

#### `renderer/hooks/useScreenshot.ts`

Renderer screenshot helper hook.

Purpose:

- wraps screenshot actions exposed via preload

### Renderer components

#### `renderer/components/TitleBar.tsx`

Top control strip.

Handles:

- hide overlay
- toggle recording
- toggle screenshot overlay preference

#### `renderer/components/QuickActions.tsx`

Action buttons for:

- answer
- shorten
- recap
- follow-up

#### `renderer/components/TranscriptPanel.tsx`

Displays interim and final transcript lines.

#### `renderer/components/ChatPanel.tsx`

Displays streamed assistant output.

#### `renderer/components/SettingsModal.tsx`

Settings UI.

Important note:

- settings schema still reflects older provider assumptions more than the current runtime architecture

#### `renderer/components/ScreenshotPreview.tsx`

Shows screenshot preview when relevant.

#### `renderer/components/InputBar.tsx`

User text input area for custom prompts.

#### `renderer/components/UsageStats.tsx`

Displays stats backed by the `usage` table.

### Shared types and constants

#### `src/shared.ts`

Defines IPC channel names and overlay window dimensions.

Important channels:

- `start-audio-capture`
- `stop-audio-capture`
- `push-audio-chunk`
- `transcript-interim`
- `transcript-update`
- `transcript-status`
- `transcript-error`
- `send-ai-message`
- `ai-chunk`
- `ai-complete`
- `ai-error`

#### `renderer/types/index.ts`

Renderer-side shared types.

Important mismatches:

- `AIProvider = 'codex'`
- `Settings.whisperModel = 'tiny.en' | 'base.en'`

The runtime audio stack still works because `database.ts` and `localTranscript.ts` normalize / use these values, but the types do not fully describe the current live architecture.

## Screenshot architecture

There are two screenshot paths.

### Path A: live renderer screen context

Used for normal AI requests.

In `renderer/App.tsx`:

- starts a display stream
- draws the frame to a hidden canvas every `200ms`
- converts canvas to JPEG data URL at quality `0.5`
- stores latest frame in `screenContextRef`
- AI requests use that stored screenshot as context

Result:

- screen context is usually at most ~`200ms` stale plus encode overhead

### Path B: explicit Electron capture

Used by explicit screenshot actions or main-process fallback capture.

In `electron/ipc/screenshotHandlers.ts`:

- captures screen using `desktopCapturer`
- if overlay exclusion is enabled:
  - hides overlay
  - waits `120ms`
  - captures
  - restores overlay

Selective capture:

- shows a temporary full-screen selection overlay
- waits for a drag rectangle
- crops the screen image

## Audio architecture

### Active path now

- mic via `getUserMedia`
- optional BlackHole `audioinput`
- `AudioContext` mixer
- `audioWorklet.js` PCM extractor
- PCM bytes sent to main via IPC
- main accumulates PCM
- main writes WAV snapshots and full chunks
- Python `faster-whisper` transcribes
- transcript IPC events update renderer

### Not active now

- `electron/services/nativeAudio.ts`
- Rust native module capture path
- Deepgram Node websocket path

Those were experimented with but are not the current path.

## LLM architecture

### Active path now

- renderer sends `AIPayload`
- `electron/ipc/aiHandlers.ts` receives it
- `electron/services/aiRouter.ts` builds prompt
- `electron/services/gemini.ts` sends request to local Ollama-compatible server
- streamed delta tokens are forwarded over IPC

### Current model and endpoint

- model: `qwen3.5:35b`
- endpoint: `http://192.168.29.234:11434/v1/chat/completions`

### Vision behavior

- `supportsVision = true`
- screenshot is sent as `image_url` content part

## Settings and persistence

Database path:

- Electron `userData` directory
- file name: `natively.db`

Stored data:

- conversation messages
- settings
- sessions
- usage totals

Settings currently persisted:

- `aiProvider`
- `codexModel`
- `codexExtraFlags`
- `googleServiceAccountPath`
- `transcriptLanguage`
- `whisperModel`
- `windowOpacity`
- `rollingContextSize`
- `includeOverlayInScreenshots`

## Files present but not currently active

These files exist, but are not the live request path right now:

- `electron/services/codex.ts`
- `electron/services/sarvam.ts`
- `electron/services/nativeAudio.ts`
- `native-module/index.js`
- `native-module/index.d.ts`
- `native-module/src/lib.rs`

They are useful as references or older experiments, but they are not the current production path of this checkout.

## Main problems / mismatches in the current repo

These are important if someone new is trying to work on the repo:

1. `gemini.ts` is not Gemini anymore.
2. Settings/types still imply Codex is the provider.
3. `nativeAudio.ts` and the Rust module exist but are not active.
4. `audio.md`, `llm.md`, and `architecture.md` may drift if architecture changes again.
5. The app mixes current code with older alternative-provider artifacts.

## If you want to change the current behavior

### To change the active LLM

Main files to touch:

- `electron/services/gemini.ts`
- `electron/services/aiRouter.ts`
- optionally `renderer/types/index.ts`
- optionally `electron/services/database.ts`

### To change STT behavior

Main files to touch:

- `renderer/App.tsx`
- `public/audioWorklet.js`
- `electron/ipc/audioHandlers.ts`
- `electron/services/localTranscript.ts`
- `scripts/transcribe_server.py`

### To change screenshot behavior

Main files to touch:

- `renderer/App.tsx`
- `electron/ipc/screenshotHandlers.ts`
- `electron/ipc/aiHandlers.ts`

## Practical one-line description

This repo is currently an Electron overlay that captures mic plus optional BlackHole audio in the renderer, transcribes with a Python `faster-whisper` sidecar, captures screen context through renderer and Electron screenshot flows, and sends transcript plus screenshot to a local Ollama-hosted `qwen3.5:35b` model through the file still named `gemini.ts`.
