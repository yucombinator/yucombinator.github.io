import { buildLive } from './gtfsrt.js';

const CACHE_KEY = 'https://sf-live.internal/live-v2.json';
const CACHE_REQUEST = new Request(CACHE_KEY);
const MAX_AGE_MS = 60_000;
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

async function cached(env) {
  const cache = caches.default;
  const hit = await cache.match(CACHE_REQUEST);
  if (hit) {
    try {
      const doc = await hit.clone().json();
      if (Date.now() - doc.generated <= MAX_AGE_MS) return hit;
    } catch { /* rebuild malformed cache entries */ }
  }
  const doc = await buildLive(env);
  const res = json(doc);
  await cache.put(CACHE_REQUEST, res.clone());
  return res;
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method' }, 405);
    try {
      return await cached(env);
    } catch (err) {
      const stale = await caches.default.match(CACHE_REQUEST);
      if (stale) {
        const res = new Response(stale.body, stale);
        res.headers.set('x-stale', '1');
        return res;
      }
      return json({ error: String(err) }, 502);
    }
  },
  async scheduled(_event, env) {
    try {
      await caches.default.put(CACHE_REQUEST, json(await buildLive(env)));
    } catch { /* the next HTTP miss retries */ }
  },
};
