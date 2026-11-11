/* Minimal GTFS-Realtime vehicle-position parser for the Bay Area.
   The 511 regional feed needs a server-side API key; Santa Cruz METRO is keyless. */

import { ROUTES } from './routes.js';

const PREFIX = {
  '3D': 'tridelta',
  AC: 'actransit',
  CC: 'countyconnection',
  CT: 'caltrain',
  DE: 'dumbarton',
  EM: 'emerygoround',
  FS: 'fairfield',
  GG: 'goldengate',
  MC: 'marin',
  MV: 'mountainview',
  SB: 'sfbayferry',
  SC: 'vta',
  SF: 'sfmta',
  SM: 'samtrans',
  SO: 'soltrans',
  SR: 'santarosa',
  ST: 'stanford',
  UC: 'unioncity',
  VC: 'vacaville',
  WC: 'westcat',
  WH: 'lavta',
};

function varint(buf, i) {
  let v = 0, shift = 0;
  for (;;) {
    const b = buf[i++];
    v |= (b & 0x7f) << shift;
    if (!(b & 0x80)) return [v, i];
    shift += 7;
  }
}

function* fields(buf) {
  let i = 0;
  while (i < buf.length) {
    let key;
    [key, i] = varint(buf, i);
    const num = key >> 3, wt = key & 7;
    if (wt === 0) {
      let v;
      [v, i] = varint(buf, i);
      yield [num, wt, v];
    } else if (wt === 2) {
      let len;
      [len, i] = varint(buf, i);
      yield [num, wt, buf.subarray(i, i + len)];
      i += len;
    } else if (wt === 5) {
      yield [num, wt, buf.subarray(i, i + 4)];
      i += 4;
    } else if (wt === 1) {
      yield [num, wt, buf.subarray(i, i + 8)];
      i += 8;
    } else {
      throw new Error(`wire type ${wt}`);
    }
  }
}

function f32(buf) {
  return new DataView(buf.buffer, buf.byteOffset, 4).getFloat32(0, true);
}

function parseVehicle(buf) {
  let route = null, lat = null, lon = null, bearing = -1, ts = 0;
  let id = '', trip = '';
  for (const [num, wt, v] of fields(buf)) {
    if (num === 1 && wt === 2) {
      for (const [tn, tw, tv] of fields(v)) {
        if (tn === 1 && tw === 2) trip = new TextDecoder().decode(tv);
        else if (tn === 5 && tw === 2) route = new TextDecoder().decode(tv);
      }
    } else if (num === 2 && wt === 2) {
      for (const [pn, pw, pv] of fields(v)) {
        if (pn === 1 && pw === 5) lat = f32(pv);
        else if (pn === 2 && pw === 5) lon = f32(pv);
        else if (pn === 3 && pw === 5) bearing = f32(pv);
      }
    } else if (num === 5 && wt === 0) {
      ts = v;
    } else if (num === 8 && wt === 2) {
      for (const [dn, dw, dv] of fields(v)) {
        if (dn === 1 && dw === 2) id = new TextDecoder().decode(dv);
        else if (dn === 2 && dw === 2 && !id) id = new TextDecoder().decode(dv);
      }
    }
  }
  return { route, lat, lon, bearing, ts, id: id || trip };
}

export function parseFeed(buf) {
  const out = [];
  for (const [num, wt, v] of fields(buf)) {
    if (num !== 2 || wt !== 2) continue; // FeedEntity
    for (const [en, ew, ev] of fields(v)) {
      if (en === 4 && ew === 2) out.push(parseVehicle(ev));
    }
  }
  return out;
}

export async function fetchFeed(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'sf-in-motion-live/1.0 (+https://yuchenhou.com)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return parseFeed(new Uint8Array(await res.arrayBuffer()));
}

function resolve(feed, liveRoute) {
  const table = ROUTES[feed];
  if (!table) return null;
  return table.ids?.[liveRoute] || table.short?.[liveRoute] || null;
}

export async function buildLive(env = {}, now = Date.now()) {
  const key = env.BAY_AREA_511_KEY || '';
  const feeds = [
    ['rg', key ? `https://api.511.org/transit/VehiclePositions?api_key=${key}&agency=RG` : null],
    ['scmtd', 'https://rt.scmetro.org/gtfsrt/vehicles'],
  ];
  const results = await Promise.allSettled(
    feeds.filter(([, url]) => url).map(async ([feed, url]) => [feed, await fetchFeed(url, 15000)]),
  );
  const routeIndex = new Map();
  const routes = [];
  const vehicles = [];
  const active = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const [feed, rows] = r.value;
    let kept = 0;
    for (const v of rows) {
      if (!v.route || v.lat === null || v.lon === null) continue;
      if (Math.abs(v.lat) < 1 || Math.abs(v.lon) < 1) continue;
      const cut = v.route.indexOf(':');
      const staticFeed = feed === 'scmtd' ? 'scmtd' : PREFIX[v.route.slice(0, cut)];
      const rid = cut >= 0 ? v.route.slice(cut + 1) : v.route;
      const staticKey = resolve(staticFeed, rid);
      if (!staticKey) continue;
      let idx = routeIndex.get(staticKey);
      if (idx === undefined) {
        idx = routes.length;
        routeIndex.set(staticKey, idx);
        routes.push(staticKey);
      }
      vehicles.push([
        idx, Math.round(v.lat * 1e5) / 1e5, Math.round(v.lon * 1e5) / 1e5,
        v.bearing >= 0 ? Math.round(v.bearing * 10) / 10 : -1,
        v.ts ? v.ts * 1000 : 0,
        v.id ? v.id : '',
      ]);
      kept++;
    }
    if (kept) active.push(feed);
  }
  return { generated: now, feeds: active, routes, v: vehicles };
}
