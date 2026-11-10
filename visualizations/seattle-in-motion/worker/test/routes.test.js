import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

test('live route ids match the static Seattle payload', async () => {
  const { buildLive } = await import('../src/gtfsrt.js');
  const data = JSON.parse(readFileSync(new URL('../../data.json', import.meta.url)));
  const known = new Set(Object.keys(data.routes));
  const doc = await buildLive();
  const matched = doc.routes.filter((k) => known.has(k)).length;
  expect(doc.routes.length).toBeGreaterThan(50);
  expect(matched / doc.routes.length).toBeGreaterThan(0.95);
});
