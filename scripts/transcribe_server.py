#!/usr/bin/env python3
"""
Natively — faster-whisper transcription server
Receives WAV paths on stdin, emits one transcript line per WAV on stdout.
"""

import logging
import os
import sys

logging.basicConfig(level=logging.ERROR)
logging.getLogger("faster_whisper").setLevel(logging.ERROR)

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base.en")
LANGUAGE = os.environ.get("WHISPER_LANG", "en")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")

sys.stderr.write(f"[transcribe_server] Loading faster-whisper model: {MODEL_SIZE}\n")
sys.stderr.write(f"[transcribe_server] Device: {DEVICE}, Compute: {COMPUTE_TYPE}\n")
sys.stderr.flush()

try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.stderr.write("[transcribe_server] ERROR: faster-whisper not installed.\n")
    sys.stderr.flush()
    print("ERROR:faster-whisper not installed. Run: pip3 install faster-whisper", flush=True)
    sys.exit(1)

try:
    model = WhisperModel(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
    )
    sys.stderr.write("[transcribe_server] Model loaded successfully\n")
    sys.stderr.flush()
except Exception as error:
    sys.stderr.write(f"[transcribe_server] ERROR loading model: {error}\n")
    sys.stderr.flush()
    print(f"ERROR:{error}", flush=True)
    sys.exit(1)

print("READY", flush=True)

HALLUCINATIONS = {
    "thank you", "thanks for watching", "you", "bye", "goodbye",
    "see you", "subscribe", "like and subscribe", ".", "..", "...",
    "uh", "um", "hmm", "hm", "ah", "oh", "okay", "ok",
    "thank you for watching", "thanks", "please subscribe",
    "subtitles by", "transcribed by", "captions by",
}


def is_hallucination(text: str) -> bool:
    cleaned = text.strip().lower().rstrip(".")
    return cleaned in HALLUCINATIONS or len(cleaned) <= 2


for raw_line in sys.stdin:
    wav_path = raw_line.strip()
    if not wav_path:
        continue

    if not os.path.exists(wav_path):
        sys.stderr.write(f"[transcribe_server] File not found: {wav_path}\n")
        sys.stderr.flush()
        continue

    try:
        segments, _ = model.transcribe(
            wav_path,
            language=LANGUAGE,
            beam_size=1,
            best_of=1,
            temperature=0.0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},
            condition_on_previous_text=False,
        )

        texts = []
        for segment in segments:
            text = segment.text.strip()
            if text and not is_hallucination(text):
                texts.append(text)

        if texts:
            result = " ".join(texts)
            print(result, flush=True)
            sys.stdout.flush()
            sys.stderr.write(f"[transcribe_server] Transcribed: {result[:80]}\n")
            sys.stderr.flush()

    except Exception as error:
        sys.stderr.write(f"[transcribe_server] Transcription error: {error}\n")
        sys.stderr.flush()
        continue
