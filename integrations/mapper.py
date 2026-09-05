"""DROP adapter. External Mapperatorinator is installed separately under its own license."""
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    import torch
    device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else None
    if not device:
        raise RuntimeError('No supported GPU')
    repo = Path(os.environ['DROP_MAPPER_DIR']).resolve()
    if not (repo / 'inference.py').is_file():
        raise RuntimeError('Missing Mapperatorinator installation')
    if sys.argv[1] == 'probe':
        # Import the actual inference dependencies, not just torch.
        sys.path.insert(0, str(repo))
        import inference
        print(json.dumps({'ready': True, 'device': device}))
        return
    from huggingface_hub import snapshot_download
    model = snapshot_download('OliBomby/Mapperatorinator-v32', revision='74f22583400d259bf424819e11027c17933efe54', allow_patterns=['README.md', 'gamemode=1/*'], cache_dir=str(repo.parent / 'models'))
    source, output = map(lambda p: Path(p).resolve(), sys.argv[2:4])
    duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', source.suffix[1:].lower(), '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(source)], timeout=20))
    if not 1 <= duration <= 600:
        raise ValueError('Unsupported duration')
    output.mkdir(parents=True, exist_ok=True)
    # Force the declared audio demuxer and local protocols, then give the model only canonical PCM.
    normalized = output / 'input.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe',
                    '-f', source.suffix[1:].lower(), '-i', str(source), '-t', '600',
                    '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', str(normalized)],
                   check=True, timeout=60)
    source = normalized
    for level, stars in [('easy', 1.8), ('hard', 3.5)]:
        folder = output / level
        folder.mkdir(parents=True, exist_ok=True)
        command = [sys.executable, str(repo / 'inference.py'), '--config-name', 'v32',
                   'audio_path=' + json.dumps(str(source)), 'output_path=' + json.dumps(str(folder)),
                   'model_path=' + json.dumps(str(Path(model) / 'gamemode=1')), 'auto_select_gamemode_model=false',
                   'gamemode=1', f'difficulty={stars}', 'year=2023', 'seed=42',
                   'device=' + device, 'generate_positions=false', 'export_osz=false',
                   'max_batch_size=1', 'attn_implementation=sdpa', 'super_timing=false',
                   'hydra.run.dir=' + json.dumps(str(output / 'logs' / level))]
        subprocess.run(command, cwd=repo, check=True)
    (output / 'duration.json').write_text(json.dumps({'durationMs': round(duration * 1000)}))


if __name__ == '__main__':
    main()
