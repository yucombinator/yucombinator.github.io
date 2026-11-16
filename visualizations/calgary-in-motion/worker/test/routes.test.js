import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildLive } from '../src/gtfsrt.js';

test('live route ids match the static Calgary payload', async () => {
  const data = JSON.parse(readFileSync(new URL('../../data.json', import.meta.url)));
  const index = JSON.parse(
    readFileSync(new URL('../../live-trips.json', import.meta.url)),
  );
  const known = new Set(Object.keys(data.routes));
  const doc = await buildLive(index);
  const matched = doc.routes.filter((k) => known.has(k)).length;
  expect(doc.routes.length).toBeGreaterThan(5);
  expect(matched).toBe(doc.routes.length);
});

test('the trip index covers every static route key', async () => {
  const data = JSON.parse(readFileSync(new URL('../../data.json', import.meta.url)));
  const index = JSON.parse(
    readFileSync(new URL('../../live-trips.json', import.meta.url)),
  );
  const known = new Set(Object.keys(data.routes));
  expect(index.routes.length).toBe(known.size);
  for (const key of index.routes) expect(known.has(key)).toBe(true);
});
