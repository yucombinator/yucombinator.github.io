import { buildLive } from './gtfsrt.js';

const CACHE_KEY = 'https://seattle-live.internal/live.json';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'cache-control': 'public, max-age=60',
};

function json(doc, status = 200) {
  return new Response(JSON.stringify(doc), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

async function cached() {
  const cache = caches.default;
  const hit = await cache.match(CACHE_KEY);
  if (hit) return hit;
  const doc = await buildLive();
  const res = json(doc);
  await cache.put(CACHE_KEY, res.clone());
  return res;
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method' }, 405);
    try {
      return await cached();
    } catch (err) {
      const stale = await caches.default.match(CACHE_KEY);
      if (stale) {
        const res = new Response(stale.body, stale);
        res.headers.set('x-stale', '1');
        return res;
      }
      return json({ error: String(err) }, 502);
    }
  },
  async scheduled() {
    try {
      await caches.default.put(CACHE_KEY, json(await buildLive()));
    } catch { /* the next HTTP miss retries */ }
  },
};
