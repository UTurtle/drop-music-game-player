import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { practiceChart } from '../src/chart';
import { publishChart } from '../scripts/publish-chart';
test('publishing writes sanitized immutable revisions and a catalog playable in another browser', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drop-publish-'));
  try {
    await mkdir(join(dir, 'charts'));
    await writeFile(join(dir, 'charts/index.json'), '[]');
    const input = join(dir, 'input.json');
    const chart = { ...practiceChart('easy'), chartId: 'test-song', audio: 'never publish this' };
    await writeFile(input, JSON.stringify(chart));
    assert.equal(await publishChart(input, dir), '/play/test-song?rev=1');
    const original = await readFile(join(dir, 'charts/test-song/r1.json'), 'utf8');
    assert.equal(original.includes('never publish'), false);
    await assert.rejects(publishChart(input, dir), /already published/);
    await writeFile(input, JSON.stringify({ ...chart, revision: 2, offsetMs: 1000 }));
    assert.equal(await publishChart(input, dir), '/play/test-song?rev=2');
    assert.equal(await readFile(join(dir, 'charts/test-song/r1.json'), 'utf8'), original);
    assert.equal(JSON.parse(await readFile(join(dir, 'charts/index.json'), 'utf8')).length, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
