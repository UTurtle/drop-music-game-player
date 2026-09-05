import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chartPath, MAX_CHART_BYTES, parseCatalog, parseChart, playPath } from '../src/chart';

/** Local packaging only. Deployment is separate; this never contacts a remote server. */
export async function publishChart(input: string, publicRoot: string) {
  if ((await stat(input)).size > MAX_CHART_BYTES) throw new Error('Chart exceeds 2 MB.');
  const chart = parseChart(JSON.parse(await readFile(input, 'utf8')));
  const catalogPath = resolve(publicRoot, 'charts/index.json');
  const catalog = parseCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
  if (catalog.some(entry => entry.chartId === chart.chartId && entry.revision === chart.revision)) throw new Error('Revision already published. Increment revision; existing links are immutable.');
  const target = resolve(publicRoot, '.' + chartPath(chart));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(chart, null, 2) + '\n', { flag: 'wx' });
  const next = [...catalog, { chartId: chart.chartId, revision: chart.revision, videoId: chart.videoId, title: chart.title, difficulty: chart.difficulty }];
  const temp = catalogPath + `.${process.pid}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, catalogPath);
  } catch (error) {
    await unlink(target);
    await unlink(temp).catch(() => {});
    throw error;
  }
  return playPath(chart);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error('Public publishing is disabled until the rights and terms workflow is established.');
  process.exitCode = 1;
}
