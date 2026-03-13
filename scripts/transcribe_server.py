#!/usr/bin/env python3
"""
Natively — faster-whisper transcription server
Receives WAV paths on stdin, emits one transcript line per WAV on stdout.
"""

import logging
import os
import re
import sys

logging.basicConfig(level=logging.ERROR)
logging.getLogger("faster_whisper").setLevel(logging.ERROR)

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "turbo")
LANGUAGE = os.environ.get("WHISPER_LANGUAGE", os.environ.get("WHISPER_LANG", "en"))
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
    print(f"[transcribe_server] loaded model: {MODEL_SIZE}", flush=True)
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

JUNK_PATTERNS = [
    re.compile(r'^\[.*?\]$'),
    re.compile(r'^\(.*?\)$'),
    re.compile(r'^[♪♫\s]+$'),
    re.compile(r'^\.+$'),
    re.compile(r'^[\s\W]{1,3}$'),
    re.compile(r'^(um+|uh+|ah+|er+|mm+)[\.,\s]*$', re.IGNORECASE),
]


def is_hallucination(text: str) -> bool:
    cleaned = text.strip().lower().rstrip(".")
    return cleaned in HALLUCINATIONS or len(cleaned) <= 2


def is_junk(text: str) -> bool:
    text = text.strip()
    if len(text) < 3:
        return True
    for pattern in JUNK_PATTERNS:
        if pattern.match(text):
            return True
    return False


def transcribe_fast(wav_path: str, language: str):
    segments, _ = model.transcribe(
        wav_path,
        language=language if language != 'auto' else None,
        beam_size=1,
        best_of=1,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=300,
            speech_pad_ms=100,
            min_speech_duration_ms=200,
            threshold=0.5,
        ),
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
    )
    for segment in segments:
        text = segment.text.strip()
        if text and not is_hallucination(text) and not is_junk(text):
            print(f'INTERIM:{text}', flush=True)


def transcribe_full(wav_path: str, language: str):
    segments, _ = model.transcribe(
        wav_path,
        language=language if language != 'auto' else None,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=100,
            min_speech_duration_ms=250,
            threshold=0.6,
        ),
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        log_prob_threshold=-1.0,
        compression_ratio_threshold=2.4,
    )
    for segment in segments:
        text = segment.text.strip()
        if text and not is_hallucination(text) and not is_junk(text):
            print(f'FINAL:{text}', flush=True)


for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue

    if line.startswith('FAST:'):
        wav_path = line[5:]
        mode = 'FAST'
    elif line.startswith('FULL:'):
        wav_path = line[5:]
        mode = 'FULL'
    else:
        wav_path = line
        mode = 'FULL'

    if not os.path.exists(wav_path):
        sys.stderr.write(f"[transcribe_server] File not found: {wav_path}\n")
        sys.stderr.flush()
        continue

    try:
        if mode == 'FAST':
            transcribe_fast(wav_path, LANGUAGE)
        else:
            transcribe_full(wav_path, LANGUAGE)
    except Exception as error:
        sys.stderr.write(f"[transcribe_server] Transcription error: {error}\n")
        sys.stderr.flush()
        continue
