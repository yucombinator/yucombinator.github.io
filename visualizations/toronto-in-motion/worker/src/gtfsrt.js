/* Minimal GTFS-Realtime vehicle-position parser + keyless Greater Toronto
   feed merge. No API keys: these agencies publish anonymous protobuf feeds. */

export const FEEDS = {
  ttc: 'https://gtfsrt.ttc.ca/vehicles/position?format=binary',
  brampton: 'https://gtfs-rt-merge.prod.bt-cadavl.com/BramptonTransit/GTFS/merged_VehiclePosition.pb',
  drt: 'https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions',
  guelph: 'https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb',
  hsr: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb',
  barrie: 'https://www.myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb',
  burlington: 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb',
  grt_bus: 'https://webapps.regionofwaterloo.ca/api/grt-routes/api/vehiclepositions/1',
  grt_lrt: 'https://webapps.regionofwaterloo.ca/api/grt-routes/api/vehiclepositions/2',
  yrt: 'https://rtu.york.ca/gtfsrealtime/VehiclePositions',
  miway: 'https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb',
};
// Metrolinx/GO, UP Express, Oakville, and other feeds either require an API
// key or do not publish vehicle positions; they remain on scheduled fallback.

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
    headers: { 'User-Agent': 'seattle-in-motion-live/1.0 (+https://yuchenhou.com)' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return parseFeed(new Uint8Array(await res.arrayBuffer()));
}

export async function buildLive(now = Date.now()) {
  const results = await Promise.allSettled(
    Object.entries(FEEDS).map(async ([feed, url]) => [feed, await fetchFeed(url)]),
  );
  const routeIndex = new Map();
  const routes = [];
  const vehicles = [];
  const feeds = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const [feed, rows] = r.value;
    let kept = 0;
    for (const v of rows) {
      if (!v.route || v.lat === null || v.lon === null) continue;
      if (Math.abs(v.lat) < 1 || Math.abs(v.lon) < 1) continue;
      const key = `${feed}:${v.route}`;
      let idx = routeIndex.get(key);
      if (idx === undefined) {
        idx = routes.length;
        routeIndex.set(key, idx);
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
  return { generated: now, feeds, routes, v: vehicles };
}
