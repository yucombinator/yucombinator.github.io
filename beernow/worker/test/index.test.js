import { beforeEach, describe, expect, test } from 'bun:test';
import worker, { parseVolumeMl, rankBeers } from '../src/index.js';

const STORES = [
  {
    id: 2413,
    locationName: 'PARLIAMENT/WINCHESTR',
    streetNo: '534',
    street: 'Parliament St.',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M4X 1P5',
    latitude: 43.666359,
    longitude: -79.368904,
    storeSlug: 'parliament-winchestr',
  },
  {
    id: 4610,
    locationName: 'QUEENS QUAY',
    streetNo: '2',
    street: 'Queens Quay W',
    city: 'Toronto',
    province: 'ON',
    postalCode: 'M5J 2N8',
    latitude: 43.64,
    longitude: -79.38,
    storeSlug: 'queens-quay',
  },
];

const LISTINGS = [
  // 24 x 355 ml @ 5% for $45.99 -> 926.3 mL ethanol per dollar
  { objectID: 'a_2413', displayName: 'BIG PACK', abv: 5, size: 24, volume: '355 ml', price: 45.99, salePrice: 45.99, isSale: false, format: 'Cans', label: '24 X Can 355 ml' },
  // Sale beats the regular price and the score must use it.
  { objectID: 'b_2413', displayName: 'SALE PACK', abv: 5, size: 24, volume: '355 ml', price: 50, salePrice: 40, isSale: true, format: 'Bottles', label: '24 X Bottle 355 ml' },
  // Keg, volume in litres.
  { objectID: 'c_2413', displayName: 'KEG', abv: 5, size: 1, volume: '30 L', price: 200, salePrice: 200, isSale: false, format: 'Kegs', label: '1 X Keg 30 L' },
  // Missing useful data -> dropped.
  { objectID: 'd_2413', displayName: 'NO PRICE', abv: 5, size: 6, volume: '355 ml', price: 0, salePrice: 0, isSale: false },
  { objectID: 'e_2413', displayName: 'NO VOLUME', abv: 5, size: 6, volume: 'unknown', price: 10, salePrice: 10, isSale: false },
];

class MemoryCache {
  constructor() {
    this.entries = new Map();
  }
  async match(request) {
    const stored = this.entries.get(request.url);
    return stored ? stored.clone() : undefined;
  }
  async put(request, response) {
    this.entries.set(request.url, response.clone());
  }
  // Pretend every stored copy was generated long ago.
  async expireAll() {
    for (const [url, response] of this.entries) {
      const body = await response.clone().text();
      const headers = new Headers(response.headers);
      headers.set('x-generated', '1');
      this.entries.set(url, new Response(body, { headers, status: 200 }));
    }
  }
}

let calls;
let failAlgolia;

function installFetchMock() {
  calls = { stores: 0, algolia: 0 };
  failAlgolia = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/api/store')) {
      calls.stores++;
      return Response.json({ data: { total: STORES.length, items: STORES } });
    }
    if (url.includes('algolia.net')) {
      if (failAlgolia) throw new Error('network down');
      calls.algolia++;
      const body = JSON.parse(init.body);
      const storeId = Number(/storeId:(\d+)/.exec(body.filters)[1]);
      const hits = LISTINGS.filter((hit) => hit.objectID.endsWith(`_${storeId}`));
      return Response.json({ hits, page: 0, nbHits: hits.length, nbPages: 1 });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

beforeEach(() => {
  globalThis.caches = { default: new MemoryCache() };
  installFetchMock();
});

const get = (path) =>
  worker.fetch(new Request(`https://yuchenhou.com/beernow/api${path}`, { method: 'GET' }));

describe('parseVolumeMl', () => {
  test('millilitres and litres', () => {
    expect(parseVolumeMl('355 ml')).toBe(355);
    expect(parseVolumeMl('58.6 L')).toBe(58600);
    expect(parseVolumeMl('30 L')).toBe(30000);
    expect(parseVolumeMl('5000 ml')).toBe(5000);
  });

  test('rejects unusable values', () => {
    expect(parseVolumeMl('unknown')).toBe(0);
    expect(parseVolumeMl('')).toBe(0);
    expect(parseVolumeMl(undefined)).toBe(0);
    expect(parseVolumeMl('0 ml')).toBe(0);
  });
});

describe('rankBeers', () => {
  const ranked = rankBeers(LISTINGS);

  test('drops listings without a usable volume or price', () => {
    expect(ranked.map((beer) => beer.id)).toEqual(['b_2413', 'a_2413', 'c_2413']);
  });

  test('scores by pure alcohol per dollar, finest first', () => {
    expect(ranked[0].score).toBeCloseTo((24 * 355 * 5) / 40, 5);
    expect(ranked[1].score).toBeCloseTo((24 * 355 * 5) / 45.99, 5);
    expect(ranked[2].score).toBeCloseTo(750, 5);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  test('uses the sale price only when it is a real discount', () => {
    const sale = ranked.find((beer) => beer.id === 'b_2413');
    expect(sale.onSale).toBe(true);
    expect(sale.effectivePrice).toBe(40);
    expect(sale.salePrice).toBe(40);
    expect(sale.price).toBe(50);

    const normal = ranked.find((beer) => beer.id === 'a_2413');
    expect(normal.onSale).toBe(false);
    expect(normal.salePrice).toBe(null);
    expect(normal.effectivePrice).toBe(45.99);
  });
});

describe('GET /stores', () => {
  test('maps the upstream store directory', async () => {
    const response = await get('/stores');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const body = await response.json();
    expect(body.count).toBe(2);
    expect(body.stores[0]).toEqual({
      id: 2413,
      name: 'PARLIAMENT/WINCHESTR',
      address: '534 Parliament St.',
      city: 'Toronto',
      province: 'ON',
      postal: 'M4X 1P5',
      slug: 'parliament-winchestr',
      lat: 43.666359,
      lon: -79.368904,
    });
  });

  test('honours limit and serves repeats from cache', async () => {
    const first = await (await get('/stores?limit=1')).json();
    expect(first.stores).toHaveLength(1);
    expect(calls.stores).toBe(1);

    await (await get('/stores')).json();
    expect(calls.stores).toBe(1);
  });
});

describe('GET /stores/:id/beers', () => {
  test('returns the store and its ranked listings', async () => {
    const response = await get('/stores/2413/beers?limit=2');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.store.id).toBe(2413);
    expect(body.total).toBe(3);
    expect(body.beers).toHaveLength(2);
    expect(body.beers[0].id).toBe('b_2413');
    expect(body.beers[0].name).toBe('SALE PACK');
    expect(body.beers[0].score).toBeGreaterThan(body.beers[1].score);
  });

  test('defaults to 25 listings and caps at 100', async () => {
    const body = await (await get('/stores/2413/beers')).json();
    expect(body.beers).toHaveLength(3);
    const capped = await get('/stores/2413/beers?limit=5000');
    expect(capped.status).toBe(200);
  });

  test('rejects unknown stores', async () => {
    const response = await get('/stores/9999/beers');
    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain('9999');
  });

  test('caches the ranked list per store', async () => {
    await get('/stores/2413/beers');
    await get('/stores/2413/beers?limit=3');
    expect(calls.algolia).toBe(1);
  });

  test('serves the stale copy when the upstream fails', async () => {
    await get('/stores/2413/beers');
    await globalThis.caches.default.expireAll();
    failAlgolia = true;
    const response = await get('/stores/2413/beers');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-stale')).toBe('1');
    expect((await response.json()).beers.length).toBeGreaterThan(0);
  });
});

describe('routing', () => {
  test('unknown path is 404 and non-GET is 405', async () => {
    expect((await get('/nope')).status).toBe(404);
    const post = await worker.fetch(
      new Request('https://yuchenhou.com/beernow/api/stores', { method: 'POST' }),
    );
    expect(post.status).toBe(405);
  });

  test('CORS preflight is answered', async () => {
    const response = await worker.fetch(
      new Request('https://yuchenhou.com/beernow/api/stores', { method: 'OPTIONS' }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
