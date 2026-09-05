import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate_chart import generate, select_events, LIMITS


@pytest.fixture
def audio(tmp_path):
    sr = 22050
    y = np.zeros(sr * 12, dtype=np.float32)
    for index, start in enumerate(np.arange(1, 11, .25)):
        t = np.arange(int(sr * .07)) / sr
        pulse = np.sin(2 * np.pi * 700 * t) * np.exp(-t * 80)
        level = 0.8 if index % 2 == 0 else 0.3
        pos = int(start * sr)
        y[pos:pos + len(pulse)] += level * pulse
    path = tmp_path / 'original-synthetic.wav'
    sf.write(path, y, sr)
    return path


def make(path, difficulty):
    return generate(path, video_id='abcdefghijk', title='Synthetic fixture', chart_id=f'fixture-{difficulty}', difficulty=difficulty)


def test_determinism_density_timing_and_no_network(audio, monkeypatch):
    before = hashlib.sha256(audio.read_bytes()).digest()
    def forbid(*args, **kwargs):
        raise AssertionError('Generator attempted networking')
    monkeypatch.setattr(socket.socket, 'connect', forbid)
    easy = make(audio, 'easy')
    hard = make(audio, 'hard')
    assert easy == make(audio, 'easy')
    assert 10 <= len(easy['notes']) < len(hard['notes'])
    for difficulty, chart in [('easy', easy), ('hard', hard)]:
        times = [n['timeMs'] for n in chart['notes']]
        assert all(b - a >= LIMITS[difficulty]['gap'] for a, b in zip(times, times[1:]))
        assert all(sum(t <= other < t + 1000 for other in times) <= LIMITS[difficulty]['density'] for t in times)
        assert all(n['lane'] == ('A' if i % 2 == 0 else 'D') for i, n in enumerate(chart['notes']))
        # The synthesized attacks are on a known quarter-second grid; tolerate DSP frame bias.
        assert all(min(abs(t - target) for target in range(1000, 11000, 250)) <= 60 for t in times)
        assert all(950 <= t <= 11050 for t in times)  # no invented notes in silence
        assert 'audio' not in chart and 'localPath' not in chart
    assert hashlib.sha256(audio.read_bytes()).digest() == before


def test_cli_stdout_is_json_and_errors_leave_no_partial_json(audio):
    args = [sys.executable, 'generate_chart.py', str(audio), '--video-id', 'abcdefghijk', '--chart-id', 'fixture', '--title', 'Fixture']
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)['provenance'] == 'algorithmic'
    assert 'Generated' in result.stderr
    bad = subprocess.run([*args, '--offset-ms', '-120000'], capture_output=True, text=True)
    assert bad.returncode != 0 and bad.stdout == '' and 'error:' in bad.stderr


def test_silence_corrupt_audio_and_invalid_metadata(tmp_path):
    path = tmp_path / 'silent.wav'
    sf.write(path, np.zeros(22050 * 2), 22050)
    with pytest.raises(ValueError, match='silent'):
        make(path, 'easy')
    path.write_text('not audio')
    with pytest.raises(ValueError, match='decode'):
        make(path, 'easy')
    with pytest.raises(ValueError, match='video-id'):
        generate(path, video_id='bad', title='x', chart_id='x', difficulty='easy')


def test_density_limit_holds_for_dense_and_tied_candidates():
    candidates = [(i * 20, 1.0) for i in range(500)]
    for difficulty, limits in LIMITS.items():
        result = select_events(candidates, difficulty)
        assert result == select_events(list(reversed(candidates)), difficulty)
        times = [n['timeMs'] for n in result]
        assert all(sum(t <= x < t + 1000 for x in times) <= limits['density'] for t in times)
