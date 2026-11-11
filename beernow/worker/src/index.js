// BeerNow API — Cloudflare Worker.
//
// Two public sources, both keyless from a browser but proxied here so the
// static page stays same-origin and the upstream response shapes never leak
// into the client:
//
//   POST https://www.thebeerstore.ca/api/store  -> store directory
//   POST https://<app>.algolia.net/1/indexes/…  -> per-store listings
//
// Everything is cached in the colo with the Cache API; a failed refresh serves
// the last good copy with `x-stale: 1`.

const API_PREFIXES = ['/beernow/api', '/api'];
const STORE_ENDPOINT = 'https://www.thebeerstore.ca/api/store';
const ALGOLIA_APP_ID = 'QAHT1LY72O';
const ALGOLIA_SEARCH_KEY = '15059df4edbf16c0ee2a3e505014a096';
const ALGOLIA_INDEX = 'Ecomm_Listing_Prod_size';
const USER_AGENT = 'BeerNow/2.0 (+https://yuchenhou.com/beernow/)';

const STORES_TTL = 6 * 60 * 60;
const BEERS_TTL = 15 * 60;
const BEER_LIMIT_DEFAULT = 25;
const BEER_LIMIT_MAX = 100;
// A single store has at most ~1.9k listings; 1000 per page, so two pages.
const ALGOLIA_PAGE_SIZE = 1000;
const ALGOLIA_MAX_PAGES = 2;

const BEER_ATTRIBUTES = [
  'objectID',
  'displayName',
  'abv',
  'size',
  'volume',
  'price',
  'salePrice',
  'isSale',
  'format',
  'label',
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = stripPrefix(url.pathname);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405);
    }

    try {
      if (path === '/stores' || path === '/stores/') {
        const limit = clampLimit(url.searchParams.get('limit'), 400, 400);
        const data = await getStores(url.origin);
        const headers = data.stale ? { 'x-stale': '1', 'cache-control': 'public, max-age=60' } : {};
        return json({ ...data, count: data.stores.length, stores: data.stores.slice(0, limit) }, 200, headers);
      }

      if (path === '/health') {
        return json({ ok: true, now: new Date().toISOString() });
      }

      const match = path.match(/^\/stores\/(\d+)\/beers\/?$/);
      if (match) {
        const storeId = Number(match[1]);
        const limit = clampLimit(url.searchParams.get('limit'), BEER_LIMIT_MAX, BEER_LIMIT_DEFAULT);
        const stores = await getStores(url.origin);
        const store = stores.stores.find((s) => s.id === storeId);
        if (!store) return json({ error: `unknown store ${storeId}` }, 404);

        const data = await getRankedBeers(url.origin, storeId);
        const headers = data.stale ? { 'x-stale': '1', 'cache-control': 'public, max-age=60' } : {};
        return json({
          store,
          generated: data.generated,
          stale: Boolean(data.stale),
          total: data.beers.length,
          beers: data.beers.slice(0, limit),
        }, 200, headers);
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'upstream unavailable', detail: String((err && err.message) || err) }, 502);
    }
  },
};

function stripPrefix(pathname) {
  for (const prefix of API_PREFIXES) {
    if (pathname === prefix) return '/';
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

function clampLimit(raw, max, fallback) {
  if (raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...CORS,
      ...extra,
    },
  });
}

// Cache API with explicit freshness so a stale copy can be served on failure.
async function cachedJson(cacheKey, ttlSeconds, producer) {
  const cache = globalThis.caches && globalThis.caches.default;
  const key = new Request(cacheKey, { method: 'GET' });
  let stale = null;

  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const generated = Number(hit.headers.get('x-generated') || 0);
      if (Date.now() - generated < ttlSeconds * 1000) return hit;
      stale = hit;
    }
  }

  try {
    const generated = Date.now();
    const payload = await producer();
    const response = json(
      { generated, ...payload },
      200,
      { 'cache-control': `public, max-age=${ttlSeconds}`, 'x-generated': String(generated) },
    );
    if (cache) await cache.put(key, response.clone());
    return response;
  } catch (err) {
    if (!stale) throw err;
    const headers = new Headers(stale.headers);
    headers.set('x-stale', '1');
    headers.set('cache-control', 'public, max-age=60');
    return new Response(stale.body, { status: 200, headers });
  }
}

async function getStores(origin) {
  const response = await cachedJson(`${origin}/__beernow/stores`, STORES_TTL, async () => {
    const body = {
      lat: 43.6532,
      lang: -79.3832,
      take: 400,
      skip: 0,
      currentDate: new Date().toISOString().slice(0, 10),
      isReturnStore: false,
    };
    const res = await fetch(STORE_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`store api ${res.status}`);
    const payload = await res.json();
    const items = payload && payload.data && payload.data.items;
    if (!Array.isArray(items) || items.length === 0) throw new Error('store api returned no stores');
    return { stores: items.map(mapStore) };
  });

  const data = await response.clone().json();
  const stale = response.headers.get('x-stale');
  return { generated: data.generated, stores: data.stores, ...(stale ? { stale: true } : {}) };
}

function mapStore(item) {
  return {
    id: item.id,
    name: item.locationName,
    address: [item.streetNo, item.street].filter(Boolean).join(' '),
    city: item.city,
    province: item.province,
    postal: item.postalCode,
    slug: item.storeSlug,
    lat: item.latitude,
    lon: item.longitude,
  };
}

async function getRankedBeers(origin, storeId) {
  const response = await cachedJson(`${origin}/__beernow/stores/${storeId}/beers`, BEERS_TTL, async () => {
    const hits = [];
    for (let page = 0; page < ALGOLIA_MAX_PAGES; page++) {
      const res = await fetch(
        `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
        {
          method: 'POST',
          headers: {
            'x-algolia-application-id': ALGOLIA_APP_ID,
            'x-algolia-api-key': ALGOLIA_SEARCH_KEY,
            'content-type': 'application/json',
            'user-agent': USER_AGENT,
          },
          body: JSON.stringify({
            query: '',
            hitsPerPage: ALGOLIA_PAGE_SIZE,
            page,
            filters: `storeId:${storeId} AND isNotAvailableAtStore:false`,
            attributesToRetrieve: BEER_ATTRIBUTES,
          }),
        },
      );
      if (!res.ok) throw new Error(`algolia ${res.status}`);
      const payload = await res.json();
      if (!Array.isArray(payload.hits)) throw new Error('algolia returned no hits');
      hits.push(...payload.hits);
      if (!payload.nbPages || payload.page >= payload.nbPages - 1) break;
    }
    const beers = rankBeers(hits);
    if (beers.length === 0) throw new Error(`no listings for store ${storeId}`);
    return { beers };
  });

  const data = await response.clone().json();
  const stale = response.headers.get('x-stale');
  return { generated: data.generated, beers: data.beers, ...(stale ? { stale: true } : {}) };
}

// "355 ml" -> 355, "58.6 L" -> 58600. Anything unparseable is dropped by
// rankBeers rather than guessed at.
export function parseVolumeMl(text) {
  const match = /([\d.]+)\s*(ml|l)\b/i.exec(String(text || ''));
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return match[2].toLowerCase() === 'l' ? value * 1000 : value;
}

// Score is the original app's formula: pack x volume x ABV / price, i.e. pure
// alcohol (mL) bought per dollar, before the 100 divisor.
export function rankBeers(hits) {
  const beers = [];
  for (const hit of hits) {
    const volumeMl = parseVolumeMl(hit.volume);
    const abv = Number(hit.abv);
    const pack = Number(hit.size);
    const price = Number(hit.price);
    const salePrice = Number(hit.salePrice);
    const onSale = Boolean(hit.isSale) && salePrice > 0 && (!price || salePrice < price);
    const effectivePrice = onSale ? salePrice : price;

    if (!(volumeMl > 0) || !(abv > 0) || !(pack > 0) || !(effectivePrice > 0)) continue;

    beers.push({
      id: hit.objectID,
      name: hit.displayName,
      label: hit.label || `${pack} x ${hit.volume}`,
      format: hit.format || '',
      pack,
      volumeMl,
      abv,
      price,
      salePrice: onSale ? salePrice : null,
      effectivePrice,
      onSale,
      score: (pack * volumeMl * abv) / effectivePrice,
    });
  }
  beers.sort((a, b) => b.score - a.score);
  return beers;
}
