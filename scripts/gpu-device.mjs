// Local operator CLI only; raw access keys are printed once, only hashes are persisted.
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const folder = resolve('.runtime'); const path = resolve(folder, 'devices.json');
let devices = [];
try { devices = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const [action, label] = process.argv.slice(2);
if (action === 'list') console.log(devices.map(item => item.label).join('\n') || 'No authorized devices.');
else if (action === 'add' && label && label.length <= 80) {
  if (devices.some(item => item.label === label)) throw new Error('Label already exists. Revoke it first.');
  const key = randomBytes(32).toString('hex');
  devices.push({ label, hash: createHash('sha256').update(key).digest('hex') });
  mkdirSync(folder, { recursive: true });
  writeFileSync(path, JSON.stringify(devices, null, 2), { mode: 0o600 });
  console.log(`Access key for ${label} (shown once; paste only into your DROP app):\n${key}`);
} else if (action === 'revoke' && label) {
  devices = devices.filter(item => item.label !== label);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path, JSON.stringify(devices, null, 2), { mode: 0o600 });
  console.log('Access revoked.');
} else throw new Error('Usage: npm run gpu:device -- add NAME | revoke NAME | list');
