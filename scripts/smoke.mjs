import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const storage = await mkdtemp(join(tmpdir(), 'hackathon-smoke-'));
try {
  const env = { ...process.env, CRAWLEE_STORAGE_DIR: storage, APIFY_TOKEN: '' };
  delete env.APIFY_IS_AT_HOME;
  delete env.ACTOR_IS_AT_HOME;
  const result = spawnSync(process.execPath, ['dist/main.js'], {
    env,
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status, 0);
  const output = JSON.parse(await readFile(join(storage, 'key_value_stores/default/OUTPUT.json'), 'utf8'));
  assert.equal(output.mode, 'fixture');
  assert.equal(output.evidence.synthetic, true);
  assert.match(output.evidence.text, /three years of experience/);
  const row = JSON.parse(await readFile(join(storage, 'datasets/default/000000001.json'), 'utf8'));
  assert.equal(row.contentHash, output.evidence.contentHash);
  console.log('PASS: synthetic evidence persisted to dataset and key-value store. No paid requests.');
} finally {
  await rm(storage, { recursive: true, force: true });
}
