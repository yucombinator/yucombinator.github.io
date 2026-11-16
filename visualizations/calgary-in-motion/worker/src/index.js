import { buildLive } from './gtfsrt.js';

const CACHE_KEY = 'https://calgary-live.internal/live.json';
const CACHE_REQUEST = new Request(CACHE_KEY);
const MAX_AGE_MS = 60_000;

// Trip -> route table emitted by build_data.py. Calgary's realtime feed has no
// route_id, so this join is the only way onto the static routes.
const TRIP_INDEX_URL =
  'https://yuchenhou.com/visualizations/calgary-in-motion/live-trips.json';
const TRIP_INDEX_TTL_MS = 6 * 60 * 60 * 1000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'cache-control': 'public, max-age=60',
};

let tripIndex = null;
let tripIndexAt = 0;

async function tripIndexDoc() {
  if (tripIndex && Date.now() - tripIndexAt < TRIP_INDEX_TTL_MS) return tripIndex;
  const res = await fetch(TRIP_INDEX_URL, {
    cf: { cacheTtl: 86_400, cacheEverything: true },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`trip index -> ${res.status}`);
  const doc = await res.json();
  if (!doc || !Array.isArray(doc.routes) || !doc.trips) {
    throw new Error('trip index malformed');
  }
  tripIndex = doc;
  tripIndexAt = Date.now();
  return doc;
}

function json(doc, status = 200) {
  return new Response(JSON.stringify(doc), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

async function cached() {
  const cache = caches.default;
  const hit = await cache.match(CACHE_REQUEST);
  if (hit) {
    try {
      const doc = await hit.clone().json();
      if (Date.now() - doc.generated <= MAX_AGE_MS) return hit;
    } catch { /* rebuild malformed cache entries */ }
  }
  const res = json(await buildLive(await tripIndexDoc()));
  await cache.put(CACHE_REQUEST, res.clone());
  return res;
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({ error: 'method' }, 405);
    try {
      return await cached();
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
  async scheduled() {
    try {
      await caches.default.put(CACHE_REQUEST, json(await buildLive(await tripIndexDoc())));
    } catch { /* the next HTTP miss retries */ }
  },
};
