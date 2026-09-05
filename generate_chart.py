#!/usr/bin/env python3
"""Local audio → deterministic A/D JSON. No model, download, or network request."""
from __future__ import annotations

import argparse
from bisect import bisect_left
import json
from pathlib import Path
import re
import sys

import librosa
import numpy as np
import soundfile as sf

SAMPLE_RATE = 22050
HOP_LENGTH = 220  # ~10 ms analysis grid; this does not promise 10 ms sync accuracy.
GENERATOR_VERSION = "librosa-0.11.0-rules-v1"
LIMITS = {"easy": {"gap": 300, "density": 3}, "hard": {"gap": 140, "density": 6}}


def select_events(candidates: list[tuple[int, float]], difficulty: str) -> list[dict]:
    """Salience-priority thinning, deterministic tie-breaks, rolling 1 s cap."""
    limits = LIMITS[difficulty]
    selected: list[int] = []
    for time_ms, score in sorted(candidates, key=lambda event: (-event[1], event[0])):
        if score <= 0:
            continue
        pos = bisect_left(selected, time_ms)
        if pos and time_ms - selected[pos - 1] < limits["gap"]:
            continue
        if pos < len(selected) and selected[pos] - time_ms < limits["gap"]:
            continue
        trial = selected[:pos] + [time_ms] + selected[pos:]
        # Only windows containing the new note can have changed density.
        cap = limits["density"]
        if any(trial[i + cap] - trial[i] < 1000 for i in range(max(0, pos - cap), min(pos + 1, len(trial) - cap))):
            continue
        selected = trial
    return [{"timeMs": t, "lane": "A" if i % 2 == 0 else "D"} for i, t in enumerate(selected)]


def analyze_audio(path: Path, difficulty: str) -> tuple[list[dict], int]:
    if not path.is_file():
        raise ValueError("Local audio file does not exist.")
    if path.stat().st_size > 100_000_000:
        raise ValueError("Audio must be no larger than 100 MB.")
    # SoundFile is local-only and supports WAV/FLAC and MP3 when its libsndfile does.
    try:
        info = sf.info(path)
        if not 1 <= info.duration <= 900:
            raise ValueError("Audio duration must be between 1 and 900 seconds.")
        audio, sr = sf.read(path, dtype="float32", always_2d=True)
    except sf.LibsndfileError as error:
        raise ValueError("Cannot decode this local audio file. Convert it locally to PCM WAV and retry.") from error
    mono = np.mean(audio, axis=1)
    if not np.all(np.isfinite(mono)) or float(np.max(np.abs(mono))) < 1e-5:
        raise ValueError("Audio is silent or contains invalid samples; no chart generated.")
    y = librosa.resample(mono, orig_sr=sr, target_sr=SAMPLE_RATE)
    duration_ms = round(len(y) / SAMPLE_RATE * 1000)
    strength = librosa.onset.onset_strength(y=y, sr=SAMPLE_RATE, hop_length=HOP_LENGTH)
    onsets = librosa.onset.onset_detect(onset_envelope=strength, sr=SAMPLE_RATE, hop_length=HOP_LENGTH, units="frames")
    _, beats = librosa.beat.beat_track(onset_envelope=strength, sr=SAMPLE_RATE, hop_length=HOP_LENGTH, units="frames", trim=False)
    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
    strength_scale = max(float(np.max(strength)), 1e-8)
    rms_threshold = max(float(np.max(rms)) * 0.035, 1e-5)
    # DSP v0 does not infer downbeats or pretend a beat index is a downbeat.
    beat_times = librosa.frames_to_time(beats, sr=SAMPLE_RATE, hop_length=HOP_LENGTH) * 1000
    candidates: dict[int, float] = {}
    for frame in onsets:
        f = int(frame)
        if rms[min(f, len(rms) - 1)] < rms_threshold:
            continue
        time_ms = round(f * HOP_LENGTH / SAMPLE_RATE * 1000)
        if time_ms < 500 or time_ms >= duration_ms - 150:
            continue
        near_beat = bool(len(beat_times) and np.min(np.abs(beat_times - time_ms)) <= 80)
        salience = float(strength[f]) / strength_scale
        threshold = 0.12 if difficulty == "easy" else 0.045
        if salience < threshold:
            continue
        score = salience + (0.55 if near_beat else 0)
        if difficulty == "easy" and len(beat_times):
            beat_index = int(np.argmin(np.abs(beat_times - time_ms)))
            score += 0.2 if near_beat and beat_index % 2 == 0 else 0
        candidates[time_ms] = max(candidates.get(time_ms, 0), score)
    notes = select_events(list(candidates.items()), difficulty)
    if not notes:
        raise ValueError("No usable rhythmic onsets found. Try a different source or author the chart manually.")
    return notes, duration_ms


def generate(path: Path, *, video_id: str, title: str, chart_id: str, difficulty: str, offset_ms: int = 0, revision: int = 1) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("--video-id must be an 11-character YouTube video ID.")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", chart_id):
        raise ValueError("--chart-id must use 1–80 lowercase letters, digits or hyphens.")
    if not title.strip() or len(title) > 200:
        raise ValueError("--title must contain 1–200 characters.")
    if difficulty not in LIMITS or not 1 <= revision <= 1_000_000 or not -120_000 <= offset_ms <= 120_000:
        raise ValueError("Invalid difficulty, revision or offset.")
    notes, duration_ms = analyze_audio(path, difficulty)
    if len(notes) > 10_000:
        raise ValueError("Too many notes; shorten the source.")
    if notes[0]["timeMs"] + offset_ms < 0:
        raise ValueError("Offset places notes before the video starts. Trim/re-author this chart first.")
    return {
        "schemaVersion": 1, "chartId": chart_id, "revision": revision,
        "videoId": video_id, "title": title.strip(), "difficulty": difficulty,
        "provenance": "algorithmic", "quality": "instant", "generator": GENERATOR_VERSION,
        "offsetMs": offset_ms, "durationMs": duration_ms, "notes": notes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path, help="Rights-cleared local MP3/WAV/FLAC; never uploaded")
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--chart-id", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--difficulty", choices=LIMITS, default="easy")
    parser.add_argument("--offset-ms", type=int, default=0)
    parser.add_argument("--revision", type=int, default=1)
    args = parser.parse_args()
    try:
        chart = generate(args.audio, video_id=args.video_id, title=args.title, chart_id=args.chart_id,
                         difficulty=args.difficulty, offset_ms=args.offset_ms, revision=args.revision)
    except (ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    json.dump(chart, sys.stdout, ensure_ascii=False, indent=2, allow_nan=False)
    sys.stdout.write("\n")
    print(f"Generated {len(chart['notes'])} notes ({args.difficulty}); inspect MV alignment before publishing.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
