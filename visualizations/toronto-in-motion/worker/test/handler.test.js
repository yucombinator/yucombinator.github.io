import { test, expect } from 'bun:test';

const store = new Map();
globalThis.caches = {
  default: {
    async match(key) { return store.get(String(key)); },
    async put(key, res) { store.set(String(key), res.clone()); },
  },
};

const { default: worker } = await import('../src/index.js');

test('serves a cached, CORS-enabled snapshot', async () => {
  const req = new Request('https://seattle-live.example/live.json');
  const res = await worker.fetch(req);
  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect(res.headers.get('content-type')).toContain('application/json');
  const doc = await res.json();
  expect(doc.v.length).toBeGreaterThan(100);
  expect(doc.routes.length).toBeGreaterThan(50);

  const again = await worker.fetch(req);
  expect(again.status).toBe(200);
  expect((await again.json()).generated).toBe(doc.generated);
});

test('scheduled handler warms the cache', async () => {
  store.clear();
  await worker.scheduled();
  expect(store.size).toBe(1);
});
