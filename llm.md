# Natively LLM + Vision Request Pipeline

This document describes the LLM stack that is active right now, including:

- the current model and endpoint
- how prompts are built
- how transcript and screenshot context are included
- how streaming responses are delivered
- where delay enters the path

## Current Active LLM Architecture

The active LLM path is:

1. Renderer triggers an AI action
2. Electron main receives the request over IPC
3. Main ensures transcript text and screenshot context are attached
4. `aiRouter.ts` builds the final prompt
5. `runGemini(...)` is called
6. `runGemini(...)` sends the request to a local Ollama-compatible server
7. The server streams response deltas back as SSE
8. Electron main forwards deltas to the renderer over IPC
9. Renderer assembles and displays the answer

## Important Naming Mismatch

The active transport file is:

- [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts)

But it is **not calling Gemini** right now.

It currently calls:

- local Ollama-compatible API
- model: `qwen3.5:35b`

The `runGemini` export name is preserved only so the rest of the app does not need to change.

## Files Involved

### IPC entrypoint

- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)

### Prompt construction

- [electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts)

### Active model transport

- [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts)

### Shared channel names

- [src/shared.ts](/Users/sumedh/cluely-natively/src/shared.ts)

### Renderer-side screenshot source

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

### Main-process screenshot fallback

- [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)

## Active Model And Endpoint

Current backend:

- endpoint: `http://192.168.29.234:11434/v1/chat/completions`
- model: `qwen3.5:35b`

Defined in:

- [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts)

Current constants:

```ts
const OLLAMA_API_URL = 'http://192.168.29.234:11434/v1/chat/completions';
const OLLAMA_MODEL = 'qwen3.5:35b';
export const supportsVision = true;
```

## Prompt Construction

File:

- [electron/services/aiRouter.ts](/Users/sumedh/cluely-natively/electron/services/aiRouter.ts)

The final prompt sent to the model is:

```text
SYSTEM_PROMPT

transcript context

[USER REQUEST]
action-specific prompt
```

### Transcript context behavior

`formatTranscriptContext()`:

- splits transcript on newline
- trims empty lines
- keeps only the last `Math.min(rollingContextSize, 8)` segments

So transcript context is currently hard-capped to:

- at most 8 segments

This is important because the model is local and long transcript context increases memory pressure.

### Action-specific prompt builders

Current request types:

- `answer`
- `shorten`
- `recap`
- `followup`
- `custom`

Current prompt builders:

- `buildAnswerPrompt()`
- `buildShortenPrompt()`
- `buildRecapPrompt()`
- `buildFollowUpPrompt()`
- `buildCustomPrompt()`

## Screenshot / Vision Context

The current model path is marked as vision-capable:

```ts
export const supportsVision = true;
```

That affects the request path in two ways:

1. AI requests can include screenshot content
2. if a screenshot is missing, main process will try to capture one before sending the request

### Screenshot content format

`runGemini(...)` builds OpenAI-compatible multimodal content parts:

```ts
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
```

Behavior:

- text prompt is always included
- if screenshot exists:
  - if it already starts with `data:`, it is used directly
  - otherwise it is wrapped as `data:image/png;base64,...`

This means the local Ollama-compatible server is expected to accept:

- OpenAI-style chat completions
- `image_url` message parts

## How Screenshot Is Actually Supplied To The LLM

There are two screenshot sources:

### 1. Primary path: renderer-maintained live screen context

File:

- [renderer/App.tsx](/Users/sumedh/cluely-natively/renderer/App.tsx)

Current behavior:

- renderer tries `getDisplayMedia(...)`
- if successful:
  - it keeps a hidden `video`
  - draws frames to a hidden `canvas`
  - captures a JPEG base64 frame every `200ms`
  - stores the latest frame in `screenContextRef.current`

Current capture loop:

```ts
const interval = window.setInterval(() => {
  ...
  const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
  screenContextRef.current = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
}, 200);
```

What this means:

- AI usually gets a screenshot that is already cached before the user clicks
- normal screenshot staleness is roughly:
  - up to `199ms`
  - plus JPEG encode + scheduling overhead
- practical freshness is roughly:
  - around `200–300ms`

### 2. Fallback path: main-process full-screen capture

File:

- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)
- [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)

If `payload.screenshot` is missing and `supportsVision` is true:

- main calls `captureFullScreen()`
- that promise is raced against a timeout of `1500ms`

Current code:

```ts
screenshot = await Promise.race([
  screenshotPromise,
  new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))
]);
```

What this means:

- if fallback capture is fast enough, AI gets a fresh screenshot
- if capture takes longer than `1500ms`, AI request proceeds without a screenshot

### What `captureFullScreen()` does

File:

- [electron/ipc/screenshotHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/screenshotHandlers.ts)

Current full-screen capture flow:

1. if overlay is visible and should not be included:
   - hide main window
   - disable mouse events
   - wait `120ms`
2. call `desktopCapturer.getSources(...)`
3. find the primary display source
4. use `source.thumbnail`
5. encode as PNG base64
6. show overlay again

Important delay:

```ts
await sleep(120);
```

So fallback capture adds at least:

- `120ms` intentional hide delay
- plus `desktopCapturer` capture time
- plus PNG encoding time

## AI Request Flow In Main Process

File:

- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)

Current handler behavior:

- logs request type
- stores user prompt source
- checks for screenshot
- if needed and `supportsVision === true`, runs fallback full-screen capture with 1500ms race
- calls `routeAIRequest(...)`
- saves assistant response after success
- tracks approximate usage

Current screenshot logic:

```ts
let screenshot = payload.screenshot ?? null;
if (!screenshot && supportsVision) {
  ...
} else if (!supportsVision) {
  screenshot = null;
}
```

## Current Ollama Request Body

File:

- [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts)

Current request body:

```ts
{
  model: 'qwen3.5:35b',
  messages: [{ role: 'user', content }],
  stream: true,
  temperature: 0.2,
  max_tokens: 2048,
  thinking: false,
  options: {
    think: false,
    num_ctx: 8192,
  },
}
```

Meaning:

- `stream: true`
  - answer arrives token-by-token
- `temperature: 0.2`
  - low randomness
- `max_tokens: 2048`
  - higher output cap for longer answers
- `thinking: false`
  - disables explicit reasoning mode
- `options.think = false`
  - second suppression for think mode
- `options.num_ctx = 8192`
  - expanded context window for transcript + prompt + answer

## Why `num_ctx` Is 8192

The model is large and local.

If transcript + system prompt + action prompt + screenshot context are too large:

- prompt size grows
- KV cache grows
- Ollama can hit resource limits

Current mitigation is:

- transcript cap: 8 segments
- `num_ctx`: 8192

This is more generous than the earlier 4096, but still a hard cap.

## Timeout And Failure Handling

File:

- [electron/services/gemini.ts](/Users/sumedh/cluely-natively/electron/services/gemini.ts)

### 30-second request timeout

Current behavior:

- `AbortController` is created before `fetch`
- request is aborted after `30000ms`

Current code:

```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);
```

### Reachability / sleep-state failures

If local server is down or unreachable:

- catches:
  - `ECONNREFUSED`
  - `fetch failed`
  - `ENOTFOUND`
  - `network`
- surfaces:

```text
Local AI server unreachable — is your GPU PC on at 192.168.29.234?
```

If request hangs too long:

- surfaces:

```text
Request timed out after 30 seconds — is your GPU PC responsive?
```

## Streaming Response Handling

The active server response is assumed to be OpenAI-style SSE.

Current parser expects lines like:

```text
data: {...}
```

It reads:

```ts
json?.choices?.[0]?.delta?.content
```

Each text delta:

- is appended to `fullText`
- is sent to renderer on:
  - `ai-chunk`

At stream end:

- accumulated text is sent on:
  - `ai-complete`

On error:

- error text is sent on:
  - `ai-error`

## Think-Block Filtering

Current logic suppresses internal `<think>...</think>` output:

```ts
if (delta.includes('<think>')) {
  inThinkingBlock = true;
}
if (inThinkingBlock) {
  if (delta.includes('</think>')) {
    inThinkingBlock = false;
  }
  continue;
}
```

Meaning:

- hidden reasoning is not shown in the UI
- only visible answer text is streamed

## IPC Channels Used By The LLM Path

Defined in:

- [src/shared.ts](/Users/sumedh/cluely-natively/src/shared.ts)

Relevant channels:

- `send-ai-message`
- `ai-chunk`
- `ai-complete`
- `ai-error`

Current exact values:

- `send-ai-message`
- `ai-chunk`
- `ai-complete`
- `ai-error`

## Persistence And Usage Tracking

File:

- [electron/ipc/aiHandlers.ts](/Users/sumedh/cluely-natively/electron/ipc/aiHandlers.ts)

Current behavior:

- saves the user-side request source before model call
- saves final assistant response after success
- estimates tokens using:
  - `Math.max(1, Math.ceil(content.length / 4))`
- tracks usage with that estimate

Important detail:

- this is approximate character-based token counting
- it is not model-native token accounting

## Delay Summary

### Normal fast path

If renderer already has a fresh screenshot in `screenContextRef.current`:

- screenshot staleness is typically about `200–300ms`
- AI request can start immediately with no main-process screenshot capture

### Fallback screenshot path

If screenshot is missing:

- main-process full-screen capture starts
- may incur:
  - `120ms` hide delay
  - screen capture time
  - PNG encode time
- request waits up to `1500ms`
- after that it proceeds text-only if capture still has not resolved

### Model response path

After request send:

- local network hop to `192.168.29.234`
- model must process prompt + transcript + image
- answer streams back token-by-token

### Maximum hard wait before transport failure

- `30000ms` before abort timeout

## Current Strengths

- fully local model path
- streaming response UI
- transcript context cap avoids runaway prompt growth
- screenshot context is usually pre-cached instead of captured on demand
- model supports vision path in current configuration
- clear timeout and unreachable-server error messages

## Current Risks / Weak Points

### 1. File naming is misleading

- `gemini.ts` is not Gemini
- `runGemini()` does not call Gemini

### 2. Vision support is assumed from server compatibility

The current request format assumes the local server accepts:

- OpenAI-compatible `/v1/chat/completions`
- `image_url` content parts
- streaming `choices[0].delta.content`

If the local Ollama-compatible server handles multimodal input differently, screenshots may be ignored or fail silently.

### 3. Large transcript + image can still pressure resources

Even with:

- transcript cap of 8 segments
- `num_ctx = 8192`

large prompts can still stress local inference memory.

### 4. Screenshot freshness is bounded by a polling loop

The live preview path is good, but still polling-based:

- interval: `200ms`
- not true frame-by-frame capture

## Short Version

If someone asks “what LLM is being used right now and how does screenshot context work?”, the answer is:

- LLM:
  - local Ollama-compatible API
  - endpoint: `http://192.168.29.234:11434/v1/chat/completions`
  - model: `qwen3.5:35b`
  - streamed over SSE
- prompt:
  - built in `aiRouter.ts`
  - includes system prompt + up to 8 transcript segments + action prompt
- screenshot:
  - usually comes from renderer’s cached 200ms screen preview loop
  - if missing, main process tries `desktopCapturer` full-screen capture
  - fallback capture is raced against `1500ms`
  - full-screen fallback includes a `120ms` hide delay to avoid capturing the overlay
