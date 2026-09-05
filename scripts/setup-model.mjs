// Separate optional runtime: original source and licenses stay in .runtime, never in the app bundle.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const runtime = resolve('.runtime');
export const python = resolve(runtime, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
export const repo = resolve(runtime, 'mapperatorinator');
const commit = '0e2b0e387aab4b35c64b0b11b12d47578dea7587';
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', timeout: 30 * 60_000 });
  if (result.status !== 0) throw new Error(`${command} failed. Install Git, uv and FFmpeg, then run npm run setup:model again.`);
}
export function setupModel() {
  for (const command of ['git', 'uv', 'ffmpeg', 'ffprobe']) {
    if (spawnSync(command, ['-version'], { stdio: 'ignore' }).error) throw new Error(`Missing ${command}. Install it and rerun npm run setup:model.`);
  }
  mkdirSync(runtime, { recursive: true });
  console.log('Installing optional Mapperatorinator (MIT) and dependencies in .runtime. First download uses several GB.');
  if (!existsSync(repo)) {
    run('git', ['init', repo]);
    run('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/OliBomby/Mapperatorinator.git']);
  }
  run('git', ['-C', repo, 'fetch', '--depth', '1', 'origin', commit]);
  run('git', ['-C', repo, 'checkout', '--detach', commit]);
  if (!existsSync(python)) run('uv', ['venv', '--python', '3.10', resolve(runtime, 'venv')]);
  const gpuIndex = process.platform === 'darwin' ? [] : ['--index-url', process.env.DROP_TORCH_INDEX ?? 'https://download.pytorch.org/whl/cu126'];
  run('uv', ['pip', 'install', '--python', python, 'torch==2.10.0', 'torchaudio==2.10.0', ...gpuIndex]);
  run('uv', ['pip', 'install', '--python', python, '-r', resolve(repo, 'requirements.txt')]);
  writeFileSync(resolve(runtime, 'installed.json'), JSON.stringify({ commit, installedAt: new Date().toISOString() }));
  console.log('Runtime installed. The model weights download on first generation.');
}
if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/setup-model.mjs')) setupModel();
