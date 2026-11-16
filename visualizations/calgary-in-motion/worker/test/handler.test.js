import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.caches = {
  default: {
    async match(key) { return store.get(String(key)); },
    async put(key, res) { store.set(String(key), res.clone()); },
  },
};

// The worker fetches the trip index from the deployed site; serve the local
// copy so the handler tests stay offline.
const tripIndexBody = readFileSync(new URL('../../live-trips.json', import.meta.url));
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('live-trips.json')) {
    return new Response(tripIndexBody, {
      headers: { 'content-type': 'application/json' },
    });
  }
  return realFetch(input, init);
};

const { default: worker } = await import('../src/index.js');

test('serves a cached, CORS-enabled snapshot', async () => {
  const req = new Request('https://calgary-live.example/live.json');
  const res = await worker.fetch(req);
  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect(res.headers.get('content-type')).toContain('application/json');
  const doc = await res.json();
  expect(doc.v.length).toBeGreaterThan(20);
  expect(doc.routes.every((k) => k.startsWith('calgary:'))).toBe(true);

  const again = await worker.fetch(req);
  expect(again.status).toBe(200);
  expect((await again.json()).generated).toBe(doc.generated);
});

test('scheduled handler warms the cache', async () => {
  store.clear();
  await worker.scheduled();
  expect(store.size).toBe(1);
});
