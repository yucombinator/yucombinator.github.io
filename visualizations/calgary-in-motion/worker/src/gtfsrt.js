/* Calgary Transit GTFS-Realtime vehicle positions.

   The keyless feed at data.calgary.ca carries a trip_id but no route_id, so
   each vehicle is joined to a static route through live-trips.json, which
   build_data.py emits from the same GTFS feed the page is drawn from. */

export const FEEDS = {
  calgary: 'https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream',
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

const UTF8 = new TextDecoder();

function parseVehicle(buf) {
  let lat = null, lon = null, bearing = -1, ts = 0;
  let id = '', trip = '';
  for (const [num, wt, v] of fields(buf)) {
    if (num === 1 && wt === 2) {
      // TripDescriptor: 1 trip_id, 5 start_time. Calgary sends no route_id.
      for (const [tn, tw, tv] of fields(v)) {
        if (tn === 1 && tw === 2) trip = UTF8.decode(tv);
      }
    } else if (num === 2 && wt === 2) {
      for (const [pn, pw, pv] of fields(v)) {
        if (pn === 1 && pw === 5) lat = f32(pv);
        else if (pn === 2 && pw === 5) lon = f32(pv);
        else if (pn === 3 && pw === 5) bearing = f32(pv);
      }
    } else if (num === 4 && wt === 0) {
      ts = v;
    } else if (num === 8 && wt === 2) {
      for (const [dn, dw, dv] of fields(v)) {
        if (dn === 1 && dw === 2) id = UTF8.decode(dv);
      }
    }
  }
  return { trip, lat, lon, bearing, ts, id };
}

export function parseFeed(buf) {
  const out = [];
  for (const [num, wt, v] of fields(buf)) {
    if (num !== 2 || wt !== 2) continue;      // FeedEntity
    for (const [en, ew, ev] of fields(v)) {
      if (en === 4 && ew === 2) out.push(parseVehicle(ev));   // entity.vehicle
    }
  }
  return out;
}

export async function fetchFeed(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'calgary-in-motion-live/1.0 (+https://yuchenhou.com)' },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return parseFeed(new Uint8Array(await res.arrayBuffer()));
}

/* tripIndex: { routes: [routeKey, ...], trips: { tripId: routeIndex } } */
export async function buildLive(tripIndex, now = Date.now()) {
  const results = await Promise.allSettled(
    Object.entries(FEEDS).map(async ([feed, url]) => [feed, await fetchFeed(url)]),
  );
  const routeSlots = new Map();
  const routes = [];
  const vehicles = [];
  const feeds = [];
  const missing = new Set();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const [feed, rows] = r.value;
    let kept = 0;
    for (const v of rows) {
      if (!v.trip || v.lat === null || v.lon === null) continue;
      if (Math.abs(v.lat) < 1 || Math.abs(v.lon) < 1) continue;
      const routeIdx = tripIndex.trips[v.trip];
      const key = routeIdx === undefined ? null : tripIndex.routes[routeIdx];
      if (!key) { missing.add(v.trip); continue; }
      let idx = routeSlots.get(key);
      if (idx === undefined) {
        idx = routes.length;
        routeSlots.set(key, idx);
        routes.push(key);
      }
      vehicles.push([
        idx, Math.round(v.lat * 1e5) / 1e5, Math.round(v.lon * 1e5) / 1e5,
        v.bearing >= 0 ? Math.round(v.bearing * 10) / 10 : -1,
        v.ts ? v.ts * 1000 : 0,
        v.id ? `${feed}:${v.id}` : '',
      ]);
      kept++;
    }
    if (kept) feeds.push(feed);
  }
  return {
    generated: now,
    feeds,
    routes,
    v: vehicles,
    ...(missing.size ? { unmapped: missing.size } : {}),
  };
}
