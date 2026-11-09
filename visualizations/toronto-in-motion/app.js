/* Toronto in Motion — scheduled TTC trips animated over a weekday, on a
   MapLibre basemap. Dots are drawn to a canvas overlay that shares the map's
   projection (shape vertices are re-projected whenever the map moves). */
(() => {
  'use strict';

  const MODES = ['subway', 'streetcar', 'lrt', 'gorail', 'gobus', 'localbus', 'up', 'ferry'];
  const MODE_LABEL = {
    subway: 'Subway', streetcar: 'Streetcar', lrt: 'LRT', gorail: 'GO train',
    gobus: 'GO bus', localbus: 'Bus', up: 'UP Express', ferry: 'Ferry',
  };
  const MODE_COLOR = {
    subway: '#f8c302', streetcar: '#da251d', lrt: '#f87005',
    gorail: '#00853e', gobus: '#5aa93f', localbus: '#5aa9e6', up: '#0075d2',
    ferry: '#1f8a9e',
  };
  const MODE_RADIUS = {
    subway: 2.7, streetcar: 2.0, lrt: 2.3, gorail: 2.5, gobus: 1.9, localbus: 1.35, up: 2.5,
    ferry: 2.2,
  };
  const isBus = (mode) => mode === 'localbus' || mode === 'gobus';
  const isTrain = (mode) => mode === 'gorail' || mode === 'up';
  const DAY = 86400;

  const $ = (id) => document.getElementById(id);
  const mapEl = $('map');
  const overlay = $('overlay');
  const octx = overlay.getContext('2d');
  const chart = $('chart');
  const chartCtx = chart.getContext('2d');
  const chartLine = $('chartline');
  const lineCtx = chartLine.getContext('2d');

  const state = {
    t: 7 * 3600,
    playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    speed: 120,
    modes: { subway: true, streetcar: true, lrt: true, gorail: true, gobus: true, localbus: true, up: true, ferry: true },
    hover: null,
    dirty: true,
    liveOn: false,
  };

  let D = null;
  let mapObj = null;
  let shapes = [];            // { pts: [[x,y]] in local metres }
  let routeIds = [];          // pointer -> route_id
  let railShapes = [];        // [{shapeIdx, color, mode}] background lines
  let slotColors = [];        // palette of dot colours (one per TTC line / mode)
  let slotMode = [];          // mode index per palette slot
  let slotOfTrip = null;      // Uint8Array slot per trip
  let trips = null;           // flat Int32Array [shape, t0, t1, routePtr]
  let tripCount = 0;
  let modeOfTrip = null;      // Uint8Array
  let hourBuckets = null;     // trip indices grouped by start hour
  let startTimes = null;      // sorted Int32Array of t0
  let px = null, py = null, pAng = null, pTrip = null;
  let slotBuckets = null, slotCounts = null;
  let activeCount = 0;       // dots currently drawn (viewport)
  let activeTotal = 0;       // trips running, on screen or not
  const modeTotals = new Array(MODES.length).fill(0);
  let view = { w: 0, h: 0, screenShapes: [] };
  let needsProjection = false;
  let dpr = 1;
  let fitZoom = 10;
  let dens = null, densW = 0, densH = 0;
  const railEl = $('rail');
  const lctx = railEl.getContext('2d');
  let linesDirty = true;
  let aff = { sx: 1, sy: 1, ox: 0, oy: 0 };
  let baseA = null, baseB = null;
  let anchorA = null, anchorB = null;
  let exactTimer = 0;
  let last = 0, lastDraw = 0, lastMoveAt = 0;
  let routeSig = -1, lastLineRefresh = 0;
  let uiAccum = 0;
  let chartW = 0, chartH = 0, lastCursorT = -1;
  let dayCache = {};
  let selected = -1;               // route pointer, -1 = none
  let selectedActive = 0;          // vehicles running on the selected route
  let selStops = null;             // projected stop positions for the selection
  let shapeRoute = null;           // shape index -> route pointer
  let routeIndexByKey = null;      // "feed:route_id" -> route pointer
  let liveRoutePtr = null;         // route pointer per live vehicle
  const stopsCache = new Map();    // feed id -> stops-<feed>.json
  let corridors = null;            // dedicated busways / RapidTO lanes
  let activeRoutes = new Set();    // routes running now, or within the grace window
  const LINE_GRACE = 15 * 60;      // seconds of schedule time
  let curDay = null, curHist = null, curStarts = null;
  let routeSlot = null, routeMode = null;
  const seenRailShape = new Set();
  let live = null;                 // parsed live.json
  let liveScreen = null;           // Float32Array [x, y, angle, slot, size]
  let liveCount = 0;
  let liveRoutes = null;           // "feed:route" -> palette slot
  let liveRouteSet = new Set();
  const LIVE_ENABLED = false;      // hidden for now; flip to true to restore
  const LIVE_STALE_MS = 30 * 60 * 1000;

  const lngLatOf = (x, y) => {
    const { kx, ky, x0, y0 } = D.proj;
    return [(x + x0) / kx, (y + y0) / ky];
  };

  /* ---------- projection ---------- */

  function projectPieces() {
    if (!D || !mapObj) return;
    const out = new Array(shapes.length);
    for (let si = 0; si < shapes.length; si++) {
      const pts = shapes[si].pts;
      const n = pts.length;
      const xy = new Float32Array(n * 2);
      const cum = new Float32Array(n);
      let prevX = 0, prevY = 0, len = 0;
      for (let i = 0; i < n; i++) {
        const [lon, lat] = lngLatOf(pts[i][0], pts[i][1]);
        const p = mapObj.project([lon, lat]);
        xy[i * 2] = p.x; xy[i * 2 + 1] = p.y;
        if (i > 0) { len += Math.hypot(p.x - prevX, p.y - prevY); cum[i] = len; }
        prevX = p.x; prevY = p.y;
      }
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let p = 0; p < xy.length; p += 2) {
        const x = xy[p], y = xy[p + 1];
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
      out[si] = { xy, cum, len, minx, miny, maxx, maxy };
    }
    view.screenShapes = out;
    if (selStops) projectStops();
    if (corridors) projectCorridors();
    baseA = mapObj.project(anchorA);
    baseB = mapObj.project(anchorB);
    aff.sx = aff.sy = 1; aff.ox = aff.oy = 0;
    linesDirty = true;
    if (live) computeLiveScreen();
  }

  // cheap affine delta while the map is mid-gesture (2 projections, no relayout)
  function updateAffine() {
    if (!mapObj || !baseA) return;
    const a = mapObj.project(anchorA), b = mapObj.project(anchorB);
    const sx = (b.x - a.x) / (baseB.x - baseA.x) || 1;
    const sy = (b.y - a.y) / (baseB.y - baseA.y) || 1;
    aff.sx = sx; aff.sy = sy;
    aff.ox = a.x - baseA.x * sx;
    aff.oy = a.y - baseA.y * sy;
    railEl.style.transform = `translate(${aff.ox}px, ${aff.oy}px) scale(${aff.sx}, ${aff.sy})`;
  }

  // one arrow per vehicle: tip ahead of the position, base behind it
  function arrowPath(ctx, x, y, ang, len, wid) {
    const c = Math.cos(ang), sn = Math.sin(ang);
    const tx = x + c * len * 0.62, ty = y + sn * len * 0.62;
    const bx = x - c * len * 0.38, by = y - sn * len * 0.38;
    const nx = -sn * wid, ny = c * wid;
    ctx.moveTo(tx, ty);
    ctx.lineTo(bx + nx, by + ny);
    ctx.lineTo(bx - nx, by - ny);
    ctx.closePath();
  }

  function drawLines() {
    const { w, h } = view;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, w, h);
    lctx.lineJoin = 'round';
    lctx.lineCap = 'round';
    const ss = view.screenShapes;
    for (const { shapeIdx, color, mode, route } of railShapes) {
      if (!activeRoutes.has(route)) continue;
      const shape = ss[shapeIdx];
      const xy = shape && shape.xy;
      if (!xy || xy.length < 4) continue;
      lctx.strokeStyle = color + (isBus(mode) ? '2b' : '5c');
      lctx.lineWidth = isBus(mode) ? 1 : 1.15;
      lctx.beginPath();
      lctx.moveTo(xy[0], xy[1]);
      for (let p = 2; p < xy.length; p += 2) lctx.lineTo(xy[p], xy[p + 1]);
      lctx.stroke();
    }
  }

  function pointAtScreen(shape, frac) {
    const target = frac * shape.len;
    const { xy, cum } = shape;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const seg = cum[i] - cum[i - 1] || 1;
    const k = (target - cum[i - 1]) / seg;
    const ax = xy[(i - 1) * 2], ay = xy[(i - 1) * 2 + 1];
    const bx = xy[i * 2], by = xy[i * 2 + 1];
    return [ax + (bx - ax) * k, ay + (by - ay) * k, bx - ax, by - ay];
  }

  /* ---------- frame ---------- */

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;

    if (needsProjection) { projectPieces(); needsProjection = false; state.dirty = true; }

    if (state.playing) {
      state.t += dt * state.speed;
      if (state.t >= DAY) state.t -= DAY;
      state.dirty = true;
    }

    if (state.dirty) {
      const busy = state.playing && now - lastMoveAt > 250;
      if (!busy || now - lastDraw >= 32) { draw(); state.dirty = false; lastDraw = now; }
    }

    if (chartW && state.t !== lastCursorT) {
      lineCtx.clearRect(0, 0, chartW, chartH);
      const cx = (state.t / DAY) * chartW;
      lineCtx.strokeStyle = 'rgba(245,194,107,.85)';
      lineCtx.lineWidth = 1;
      lineCtx.beginPath(); lineCtx.moveTo(cx, 0); lineCtx.lineTo(cx, chartH); lineCtx.stroke();
      lineCtx.fillStyle = 'rgba(245,194,107,.9)';
      lineCtx.beginPath(); lineCtx.arc(cx, chartH - 2, 2.5, 0, Math.PI * 2); lineCtx.fill();
      lastCursorT = state.t;
    }

    uiAccum += dt;
    if (uiAccum > 0.12) { updateUI(); uiAccum = 0; }

    requestAnimationFrame(frame);
  }

  function computeLiveScreen() {
    if (!live || !mapObj || !liveRoutes) return;
    const rows = live.v;
    liveScreen = new Float32Array(rows.length * 4);
    liveRoutePtr = new Int32Array(rows.length);
    let m = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const slot = liveRoutes.get(live.routes[row[0]]);
      if (slot === undefined) continue;
      const p = mapObj.project([row[2], row[1]]);
      if (p.x < -40 || p.y < -40 || p.x > view.w + 40 || p.y > view.h + 40) continue;
      const bearing = row[3];
      liveScreen[m * 4] = p.x;
      liveScreen[m * 4 + 1] = p.y;
      liveScreen[m * 4 + 2] = bearing >= 0 ? bearing * Math.PI / 180 - Math.PI / 2 : 0;
      liveScreen[m * 4 + 3] = slot;
      liveRoutePtr[m] = liveRoutes.has(live.routes[row[0]]) ? routeIndexByKey.get(live.routes[row[0]]) : -1;
      m++;
    }
    liveCount = m;
  }

  function draw() {
    const { w, h } = view;
    octx.clearRect(0, 0, w, h);
    const ss = view.screenShapes;
    if (!ss.length) return;

    // rail lines live on their own canvas layer; redraw only when the
    // projection changes (not every frame)
    if (linesDirty) { drawLines(); linesDirty = false; railEl.style.transform = ''; }
    if (aff.sx !== 1 || aff.sy !== 1 || aff.ox || aff.oy) {
      railEl.style.transform = `translate(${aff.ox}px, ${aff.oy}px) scale(${aff.sx}, ${aff.sy})`;
    }

    // dots: count every running trip, draw only the ones on screen
    activeCount = 0;
    activeTotal = 0;
    modeTotals.fill(0);
    const t = state.t;
    selectedActive = 0;
    if (slotCounts) slotCounts.fill(0);
    activeRoutes.clear();
    let routeSigCount = 0, routeSigSum = 0;
    const hEnd = t / 3600 | 0;
    for (let back = 0, mask = 0; back <= 4; back++) {
      const hh = (hEnd - back + 24) % 24;
      if (mask & (1 << hh)) continue;
      mask |= 1 << hh;
      const bucket = hourBuckets[hh];
      for (let j = 0; j < bucket.length; j++) {
        const i = bucket[j];
        const t0 = trips[i * 4 + 1], t1 = trips[i * 4 + 2];
        const w0 = t, w1 = t + DAY;
        const activeNow = (w0 >= t0 && w0 <= t1) || (w1 >= t0 && w1 <= t1);
        // keep the line for a grace window on either side of a trip, so a bus
        // that is between runs does not blink its route off the map
        const nearNow = activeNow
          || (w0 >= t0 - LINE_GRACE && w0 <= t1 + LINE_GRACE)
          || (w1 >= t0 - LINE_GRACE && w1 <= t1 + LINE_GRACE);
        if (!nearNow) continue;
        const mode = modeOfTrip[i];
        // a disabled mode loses its line as well as its arrows
        if (!state.modes[MODES[mode]]) continue;
        activeRoutes.add(trips[i * 4 + 3]);
        routeSigCount++;
        routeSigSum += trips[i * 4 + 3];
        if (!activeNow) continue;
        const tt = (w0 >= t0 && w0 <= t1) ? w0 : w1;
        activeTotal++;
        modeTotals[mode]++;
        if (selected >= 0 && trips[i * 4 + 3] === selected) selectedActive++;
        if (state.liveOn && liveRouteSet.has(routeIds[trips[i * 4 + 3]])) continue;
        const shape = ss[trips[i * 4]];
        if (!shape || shape.len === 0) continue;
        const [bx, by, dx, dy] = pointAtScreen(shape, (tt - t0) / (t1 - t0));
        const X = bx * aff.sx + aff.ox, Y = by * aff.sy + aff.oy;
        if (X < -10 || Y < -10 || X > w + 10 || Y > h + 10) continue;
        if (activeCount >= px.length) continue;
        px[activeCount] = X; py[activeCount] = Y;
        pAng[activeCount] = Math.atan2(dy * aff.sy, dx * aff.sx);
        pTrip[activeCount] = i;
        const slot = slotOfTrip[i];
        if (slotCounts && slot < slotCounts.length) {
          slotBuckets[slot][slotCounts[slot]++] = activeCount;
        }
        activeCount++;
      }
    }

    if (corridors) {
      const zc = mapObj ? mapObj.getZoom() : fitZoom;
      const band = Math.min(13, Math.max(6, 3.5 + (zc - 8) * 1.6));
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      for (const g of corridors) {
        if (!g.screen) continue;
        octx.strokeStyle = 'rgba(232,242,238,.16)';
        octx.lineWidth = band;
        octx.beginPath();
        for (const xy of g.screen) {
          for (let p = 0; p < xy.length; p += 2) {
            const X = xy[p] * aff.sx + aff.ox;
            const Y = xy[p + 1] * aff.sy + aff.oy;
            if (p === 0) octx.moveTo(X, Y); else octx.lineTo(X, Y);
          }
        }
        octx.stroke();

        octx.strokeStyle = 'rgba(232,242,238,.55)';
        octx.lineWidth = 1.2;
        octx.setLineDash([5, 4]);
        octx.beginPath();
        for (const xy of g.screen) {
          for (let p = 0; p < xy.length; p += 2) {
            const X = xy[p] * aff.sx + aff.ox;
            const Y = xy[p + 1] * aff.sy + aff.oy;
            if (p === 0) octx.moveTo(X, Y); else octx.lineTo(X, Y);
          }
        }
        octx.stroke();
        octx.setLineDash([]);
      }
      octx.restore();
    }

    const z = mapObj ? mapObj.getZoom() : fitZoom;
    const zf = Math.min(1.6, Math.max(0.72, Math.pow(1.22, z - fitZoom)));
    const selMode = selected >= 0 ? MODES[routeMode[selected]] : '';
    const selIsRail = selMode === 'subway' || selMode === 'lrt'
      || selMode === 'gorail' || selMode === 'up';

    if (selected >= 0) {
      const col = slotColors[routeSlot[selected]];
      octx.save();
      octx.strokeStyle = col;
      octx.lineWidth = selIsRail ? Math.min(7, 3.6 * zf) : 1.7;
      octx.globalAlpha = 0.9;
      octx.lineJoin = 'round';
      for (let i = 0; i < ss.length; i++) {
        if (shapeRoute[i] !== selected) continue;
        const shape = ss[i];
        if (!shape || shape.xy.length < 4) continue;
        octx.beginPath();
        const xy = shape.xy;
        for (let p = 0; p < xy.length; p += 2) {
          const X = xy[p] * aff.sx + aff.ox, Y = xy[p + 1] * aff.sy + aff.oy;
          if (p === 0) octx.moveTo(X, Y); else octx.lineTo(X, Y);
        }
        octx.stroke();
      }
      octx.restore();
    }

    // soft additive halo behind the dots (cheap glow: no canvas shadows).
    // At region zoom the bus haze is both slow and unreadable, so skip it.
    const skipBusGlow = z < 9.5 || activeTotal > 1800;
    octx.globalCompositeOperation = 'lighter';
    for (let si = 0; si < slotColors.length; si++) {
      const mode = MODES[slotMode[si]];
      if (!state.modes[mode]) continue;
      if (skipBusGlow && isBus(mode)) continue;
      octx.fillStyle = slotColors[si];
      octx.globalAlpha = isBus(mode) ? 0.055 : 0.13;
      const glowR = MODE_RADIUS[mode] * 2.7 * zf;
      const bucket = slotBuckets[si], cnt = slotCounts[si];
      octx.beginPath();
      for (let j = 0; j < cnt; j++) {
        const k = bucket[j];
        if (selected >= 0 && trips[pTrip[k] * 4 + 3] !== selected) continue;
        octx.moveTo(px[k] + glowR, py[k]);
        octx.arc(px[k], py[k], glowR, 0, Math.PI * 2);
      }
      octx.fill();
    }
    octx.globalCompositeOperation = 'source-over';
    octx.globalAlpha = 1;
    for (let si = 0; si < slotColors.length; si++) {
      const mode = MODES[slotMode[si]];
      if (!state.modes[mode]) continue;
      octx.fillStyle = slotColors[si];
      octx.globalAlpha = (isBus(mode) ? 0.8 : 1) * (selected >= 0 ? 0.5 : 1);
      const r = MODE_RADIUS[mode] * zf;
      const len = isTrain(mode) ? r * 4.0 : isBus(mode) ? r * 2.4 : r * 2.9;
      const wid = isTrain(mode) ? r * 1.6 : isBus(mode) ? r * 0.9 : r * 1.15;
      const bucket = slotBuckets[si], cnt = slotCounts[si];
      octx.beginPath();
      for (let j = 0; j < cnt; j++) {
        const k = bucket[j];
        arrowPath(octx, px[k], py[k], pAng[k], len, wid);
      }
      octx.fill();
    }

    // the selected route stays at full strength on top of the dimmed traffic
    if (selected >= 0) {
      octx.globalAlpha = 1;
      for (let si = 0; si < slotColors.length; si++) {
        const mode = MODES[slotMode[si]];
        if (!state.modes[mode]) continue;
        // buses are the smallest arrows at rest; give them a bigger boost
        // on the selection so they read as clearly as rail
        const r = MODE_RADIUS[mode] * zf * (isBus(mode) ? 2.5 : 1.55);
        const len = isTrain(mode) ? r * 4.0 : isBus(mode) ? r * 2.4 : r * 2.9;
        const wid = isTrain(mode) ? r * 1.6 : isBus(mode) ? r * 0.9 : r * 1.15;
        octx.beginPath();
        let any = false;
        const bucket = slotBuckets[si], cnt = slotCounts[si];
        for (let j = 0; j < cnt; j++) {
          const k = bucket[j];
          if (trips[pTrip[k] * 4 + 3] !== selected) continue;
          any = true;
          arrowPath(octx, px[k], py[k], pAng[k], len, wid);
        }
        if (any) {
          octx.strokeStyle = '#0a141b';
          octx.lineWidth = 2.4;
          octx.stroke();
          octx.fillStyle = slotColors[si];
          octx.fill();
        }
      }
    }
    octx.globalAlpha = 1;

    // thin rim on rail dots so Line 6 grey and Line 4 magenta read on the map
    octx.lineWidth = 0.8;
    octx.strokeStyle = 'rgba(255,255,255,.30)';
    for (let si = 0; zf >= 0.95 && si < slotColors.length; si++) {
      const mode = MODES[slotMode[si]];
      if (isBus(mode) || !state.modes[mode]) continue;
      const r = MODE_RADIUS[mode] * zf;
      const len = isTrain(mode) ? r * 4.0 : r * 2.9;
      const wid = isTrain(mode) ? r * 1.6 : r * 1.15;
      const bucket = slotBuckets[si], cnt = slotCounts[si];
      octx.beginPath();
      for (let j = 0; j < cnt; j++) {
        const k = bucket[j];
        if (selected >= 0 && trips[pTrip[k] * 4 + 3] !== selected) continue;
        arrowPath(octx, px[k], py[k], pAng[k], len, wid);
      }
      octx.stroke();
    }

    if (state.liveOn && liveScreen && liveCount) {
      const lz = mapObj ? mapObj.getZoom() : fitZoom;
      const lzf = Math.min(1.6, Math.max(0.72, Math.pow(1.22, lz - fitZoom)));
      octx.globalAlpha = 1;
      for (let si = 0; si < slotColors.length; si++) {
        const mode = MODES[slotMode[si]];
        if (!state.modes[mode]) continue;
        let any = false;
        for (let k = 0; k < liveCount; k++) if (liveScreen[k * 4 + 3] === si) { any = true; break; }
        if (!any) continue;
        octx.fillStyle = slotColors[si];
        const r = MODE_RADIUS[mode] * lzf * 1.25;
        const len = isTrain(mode) ? r * 4.0 : isBus(mode) ? r * 2.4 : r * 2.9;
        const wid = isTrain(mode) ? r * 1.6 : isBus(mode) ? r * 0.9 : r * 1.15;
        octx.beginPath();
        octx.globalAlpha = selected >= 0 ? 0.5 : 1;
        for (let k = 0; k < liveCount; k++) {
          if (liveScreen[k * 4 + 3] !== si) continue;
          const x = liveScreen[k * 4] * aff.sx + aff.ox;
          const y = liveScreen[k * 4 + 1] * aff.sy + aff.oy;
          arrowPath(octx, x, y, liveScreen[k * 4 + 2], len, wid);
        }
        octx.fill();
      }
      if (selected >= 0) {
        octx.globalAlpha = 1;
        for (let si = 0; si < slotColors.length; si++) {
          const mode = MODES[slotMode[si]];
          if (!state.modes[mode]) continue;
          const r = MODE_RADIUS[mode] * lzf * 1.25;
          const len = isTrain(mode) ? r * 4.0 : isBus(mode) ? r * 2.4 : r * 2.9;
          const wid = isTrain(mode) ? r * 1.6 : isBus(mode) ? r * 0.9 : r * 1.15;
          octx.fillStyle = slotColors[si];
          octx.beginPath();
          let any = false;
          for (let k = 0; k < liveCount; k++) {
            if (liveScreen[k * 4 + 3] !== si || liveRoutePtr[k] !== selected) continue;
            any = true;
            arrowPath(octx, liveScreen[k * 4] * aff.sx + aff.ox,
                      liveScreen[k * 4 + 1] * aff.sy + aff.oy,
                      liveScreen[k * 4 + 2], len, wid);
          }
          if (any) octx.fill();
        }
      }
      octx.globalAlpha = 1;
    }

    if (selected >= 0 && selStops) {
      const col = slotColors[routeSlot[selected]];
      const meta = D.routes[routeIds[selected]] || {};
      const n = selStops.n;
      const sx = (i) => selStops.x[i] * aff.sx + aff.ox;
      const sy = (i) => selStops.y[i] * aff.sy + aff.oy;
      octx.globalAlpha = 1;

      if (selIsRail) {
        // TTC official-map station treatment: white discs with a dark edge on
        // a heavier line, bigger at the terminals, plus route-number badges
        const sr = 2.5 + zf * 1.2;
        const branded = selMode === 'gorail' || selMode === 'up';
        octx.fillStyle = '#ffffff';
        octx.strokeStyle = branded ? col : '#0d1319';
        octx.lineWidth = 1.6;
        octx.beginPath();
        for (let i = 0; i < n; i++) {
          const r = (i === 0 || i === n - 1) ? sr * 1.35 : sr;
          octx.moveTo(sx(i) + r, sy(i));
          octx.arc(sx(i), sy(i), r, 0, Math.PI * 2);
        }
        octx.fill();
        octx.stroke();

        const badge = meta.s;
        const drawGoBadge = (i, fromI) => {
          let dx = sx(i) - sx(fromI), dy = sy(i) - sy(fromI);
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          const w = sr * 5.2, h = sr * 3.4;
          const bx = sx(i) + dx * sr * 4.2;
          const by = sy(i) + dy * sr * 4.2;
          const rr = Math.min(h / 2, 3.5);
          octx.beginPath();
          octx.moveTo(bx - w / 2 + rr, by - h / 2);
          octx.arcTo(bx + w / 2, by - h / 2, bx + w / 2, by + h / 2, rr);
          octx.arcTo(bx + w / 2, by + h / 2, bx - w / 2, by + h / 2, rr);
          octx.arcTo(bx - w / 2, by + h / 2, bx - w / 2, by - h / 2, rr);
          octx.arcTo(bx - w / 2, by - h / 2, bx + w / 2, by - h / 2, rr);
          octx.closePath();
          octx.fillStyle = selMode === 'up' ? col : '#00853e';
          octx.fill();
          octx.strokeStyle = '#ffffff';
          octx.lineWidth = 1.3;
          octx.stroke();
          octx.fillStyle = '#ffffff';
          octx.font = `800 ${Math.max(8, Math.round(h * 0.62))}px system-ui, sans-serif`;
          octx.textAlign = 'center';
          octx.textBaseline = 'middle';
          octx.fillText(selMode === 'up' ? 'UP' : 'GO', bx, by + 0.5);
          octx.textAlign = 'start';
        };
        const drawBadge = (i, fromI) => {
          let dx = sx(i) - sx(fromI), dy = sy(i) - sy(fromI);
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          const br = sr * 2;
          const bx = sx(i) + dx * sr * 3.2;
          const by = sy(i) + dy * sr * 3.2;
          octx.beginPath();
          octx.arc(bx, by, br, 0, Math.PI * 2);
          octx.fillStyle = col;
          octx.fill();
          octx.strokeStyle = '#ffffff';
          octx.lineWidth = 1.5;
          octx.stroke();
          octx.fillStyle = '#ffffff';
          octx.font = `700 ${Math.max(9, Math.round(br * 1.05))}px system-ui, sans-serif`;
          octx.textAlign = 'center';
          octx.textBaseline = 'middle';
          octx.fillText(badge, bx, by + 0.5);
          octx.textAlign = 'start';
        };
        if (n >= 2 && (branded || badge)) {
          if (branded) {
            drawGoBadge(0, 1);
            drawGoBadge(n - 1, n - 2);
          } else {
            drawBadge(0, 1);
            drawBadge(n - 1, n - 2);
          }
        }
      } else {
        octx.fillStyle = '#0b141b';
        octx.strokeStyle = col;
        octx.lineWidth = 1.6;
        octx.beginPath();
        for (let i = 0; i < n; i++) {
          octx.moveTo(sx(i) + 3.1, sy(i));
          octx.arc(sx(i), sy(i), 3.1, 0, Math.PI * 2);
        }
        octx.fill();
        octx.stroke();
        const zl = mapObj ? mapObj.getZoom() : fitZoom;
        if (zl >= 13) {
          octx.fillStyle = 'rgba(224,238,233,.9)';
          octx.font = '10px system-ui, sans-serif';
          octx.textBaseline = 'middle';
          for (let i = 0; i < n; i++) octx.fillText(selStops.name[i], sx(i) + 6, sy(i));
        }
      }
    }

    const sig = routeSigCount * 1000003 + routeSigSum;
    if (sig !== routeSig && performance.now() - lastLineRefresh > 400) {
      routeSig = sig;
      lastLineRefresh = performance.now();
      linesDirty = true;
      state.dirty = true;      // the redraw needs another frame
    }

    if (state.hover != null && state.hover < activeCount) {
      const k = state.hover;
      octx.strokeStyle = 'rgba(255,255,255,.9)';
      octx.lineWidth = 1;
      octx.beginPath(); octx.arc(px[k], py[k], 7, 0, Math.PI * 2); octx.stroke();
    }
  }

  /* ---------- layout ---------- */

  const bottomPad = () => {
    const panel = document.querySelector('.panel');
    const ph = panel ? panel.offsetHeight : 220;
    return Math.min(window.innerHeight * 0.55, ph + 26);
  };

  function resize() {
    const w = overlay.clientWidth, h = overlay.clientHeight;
    const rawDpr = window.devicePixelRatio || 1;
    // big screens at 2x are 4x the pixels; cap the effect layers so the
    // dot pass stays under a few ms instead of dominating the frame
    dpr = Math.min(rawDpr, w * h > 1.1e6 ? 1.3 : 1.75);
    overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = w; view.h = h;
    railEl.width = Math.round(w * dpr);
    railEl.height = Math.round(h * dpr);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, w, h);
    railEl.style.transform = '';
    linesDirty = true;

    const cw = chart.clientWidth, ch = chart.clientHeight;
    chart.width = Math.round(cw * dpr); chart.height = Math.round(ch * dpr);
    chartLine.width = chart.width; chartLine.height = chart.height;
    chartW = chartLine.clientWidth; chartH = chartLine.clientHeight;
    lastCursorT = -1;
    chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawChart();
    needsProjection = true;
    state.dirty = true;
  }

  /* ---------- chart ---------- */

  // Departures per 10 minutes, in the Montreal in Motion idiom: one bar per
  // bucket instead of a stacked area, where the bus layer buried everything
  // above it. The mode toggles still filter, and the y-scale follows them.
  function drawChart() {
    if (!D || !chart.clientWidth || !curStarts) return;
    const w = chart.clientWidth, h = chart.clientHeight;
    chartCtx.clearRect(0, 0, w, h);
    const buckets = 144;
    const totals = new Float32Array(buckets);
    MODES.forEach((m, mi) => {
      if (!state.modes[m]) return;
      for (let b = 0; b < buckets; b++) totals[b] += curStarts[mi * buckets + b];
    });
    // Three-tap smoothing: ten-minute counts of 2-5 departures are noisy, and
    // the bars read as static rather than as the shape of the service day.
    // Edges are left alone because the day boundary is real, not periodic.
    const smooth = new Float32Array(buckets);
    for (let b = 0; b < buckets; b++) {
      smooth[b] = (b === 0 || b === buckets - 1)
        ? totals[b]
        : (totals[b - 1] + 2 * totals[b] + totals[b + 1]) / 4;
    }

    let max = 0;
    for (let b = 0; b < buckets; b++) if (smooth[b] > max) max = smooth[b];
    if (!max) return;
    const bw = w / buckets;
    const grad = chartCtx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, 'rgba(245,194,107,.20)');
    grad.addColorStop(1, 'rgba(245,194,107,.90)');
    chartCtx.fillStyle = grad;
    for (let b = 0; b < buckets; b++) {
      const v = smooth[b];
      if (!v) continue;
      const bh = Math.max(1, (v / max) * (h - 3));
      chartCtx.fillRect(b * bw + 0.5, h - bh, Math.max(1, bw - 1), bh);
    }
  }

  /* ---------- service days ---------- */

  function addRailShapes(dd) {
    for (const [shapeIdx, , , ridx] of dd.trips) {
      if (shapeRoute && shapeRoute[shapeIdx] < 0) shapeRoute[shapeIdx] = ridx;
      const slot = routeSlot[ridx];
      const k = shapeIdx + ':' + slot;
      if (seenRailShape.has(k)) continue;
      seenRailShape.add(k);
      railShapes.push({ shapeIdx, color: slotColors[slot], mode: MODES[routeMode[ridx]], route: ridx });
    }
    linesDirty = true;
  }

  function prepareDay(key, dd) {
    const n = dd.trips.length;
    const tripsArr = new Int32Array(n * 4);
    const modes = new Uint8Array(n);
    const slots = new Uint8Array(n);
    const starts = new Int32Array(n);
    const startsBins = new Uint16Array(MODES.length * 144);
    const buckets = Array.from({ length: 24 }, () => []);
    for (let i = 0; i < n; i++) {
      const [shape, t0, t1, ridx] = dd.trips[i];
      buckets[(t0 / 3600 | 0) % 24].push(i);
      tripsArr[i * 4] = shape; tripsArr[i * 4 + 1] = t0;
      tripsArr[i * 4 + 2] = t1; tripsArr[i * 4 + 3] = ridx;
      modes[i] = routeMode[ridx];
      slots[i] = routeSlot[ridx];
      starts[i] = t0;
      startsBins[routeMode[ridx] * 144 + ((t0 % DAY) / 600 | 0)]++;
    }
    return {
      key, label: dd.label, date: dd.date, tz: dd.tz,
      trips: tripsArr, n, modeOfTrip: modes, slotOfTrip: slots,
      hourBuckets: buckets, startTimes: starts.slice().sort(),
      hist: dd.hist, startsBins,
    };
  }

  async function activateDay(key) {
    if (!dayCache[key]) {
      const btn = document.querySelector(`#days button[data-day="${key}"]`);
      if (btn) btn.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(`data-${key}.json?v=20261109p`);
        if (!res.ok) throw new Error('data-' + key + ' ' + res.status);
        const dd = await res.json();
        dayCache[key] = prepareDay(key, dd);
        addRailShapes(dd);
      } catch (err) {
        console.warn('day load failed:', err);
        if (btn) btn.removeAttribute('aria-busy');
        return;
      }
      if (btn) btn.removeAttribute('aria-busy');
    }
    if (!dayCache[key]) return;
    const d = dayCache[key];
    curDay = key;
    trips = d.trips; tripCount = d.n;
    modeOfTrip = d.modeOfTrip; slotOfTrip = d.slotOfTrip;
    hourBuckets = d.hourBuckets; startTimes = d.startTimes;
    curHist = d.hist;
    curStarts = d.startsBins;
    linesDirty = true;
    routeSig = -1;
    $('dayLabel').textContent = d.label;
    $('zone').textContent = d.tz || 'EST';
    $('s-total').textContent = d.n.toLocaleString();
    if (D.built) {
      const when = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(D.built));
      const el = $('updated');
      if (el) el.textContent = 'Updated ' + when;
    }
    let bestB = 0, bestV = 0;
    for (let b = 0; b < 144; b++) {
      const v = MODES.reduce((sum, m) => sum + (curHist[m]?.[b] || 0), 0);
      if (v > bestV) { bestV = v; bestB = b; }
    }
    state.dirty = true;
    if (selected >= 0) fillRoutePanel(selected);
    const hh = String(Math.floor(bestB / 6)).padStart(2, '0');
    document.querySelector('.stats').children[2].innerHTML =
      `Peak hour <b>${hh}:00</b> · ${Math.round(bestV).toLocaleString()} vehicles`;
    document.querySelectorAll('#days button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.day === key));
    });
    drawChart();
    state.dirty = true;
    updateUI();
  }

  /* ---------- route selection ---------- */

  function projectCorridors() {
    if (!corridors || !mapObj) return;
    for (const g of corridors) {
      g.screen = g.lines.map((line) => {
        const xy = new Float32Array(line.length * 2);
        for (let i = 0; i < line.length; i++) {
          const p = mapObj.project([line[i][1], line[i][0]]);
          xy[i * 2] = p.x;
          xy[i * 2 + 1] = p.y;
        }
        return xy;
      });
    }
  }

  async function loadCorridors() {
    try {
      const res = await fetch('busways.json?v=20261109p');
      if (!res.ok) return;
      const doc = await res.json();
      corridors = (doc.groups || []).map((g) => ({ name: g.name, lines: g.lines }));
      if (mapObj) projectCorridors();
      state.dirty = true;
    } catch { /* overlay is optional */ }
  }

  function projectStops() {
    if (!selStops || !mapObj) return;
    const n = selStops.n;
    selStops.x = new Float32Array(n);
    selStops.y = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = mapObj.project([selStops.lon[i], selStops.lat[i]]);
      selStops.x[i] = p.x;
      selStops.y[i] = p.y;
    }
  }

  function routeStats(idx) {
    let tripsN = 0, first = Infinity, last = -1;
    const hours = new Array(24).fill(0);
    // departures per shape inside each hour: a route's shapes are its
    // directions (and short-turn variants), so the busiest shape gives the
    // per-direction frequency instead of counting both ways at once.
    const byShape = Array.from({ length: 24 }, () => new Map());
    for (let i = 0; i < tripCount; i++) {
      if (trips[i * 4 + 3] !== idx) continue;
      tripsN++;
      const t0 = trips[i * 4 + 1], t1 = trips[i * 4 + 2];
      if (t0 < first) first = t0;
      if (t1 > last) last = t1;
      const h = (t0 / 3600 | 0) % 24;
      hours[h]++;
      const m = byShape[h];
      const shape = trips[i * 4];
      m.set(shape, (m.get(shape) || 0) + 1);
    }
    if (tripsN === 0) {
      return { trips: 0, first: 0, last: 0, peak: 0, peakHour: -1, headway: 0 };
    }
    let peakHour = -1, peakCount = 0;
    for (let h = 5; h <= 23; h++) {
      if (hours[h] > peakCount) { peakCount = hours[h]; peakHour = h; }
    }
    if (peakHour < 0) {
      for (let h = 0; h < 24; h++) {
        if (hours[h] > peakCount) { peakCount = hours[h]; peakHour = h; }
      }
    }
    let busiest = 0;
    for (const count of byShape[peakHour].values()) if (count > busiest) busiest = count;
    return {
      trips: tripsN,
      first: tripsN ? first % DAY : 0,
      last: tripsN ? last % DAY : 0,
      peak: peakCount,
      peakHour,
      headway: busiest ? 60 / busiest : 0,
    };
  }

  function updateRouteStats(idx) {
    const stats = routeStats(idx);
    const km = selStops && selStops.km ? selStops.km : 0;
    const run = selStops && selStops.run ? selStops.run : 0;
    const stopsN = selStops ? selStops.n : 0;
    const bits = [`<span><b>${stats.trips.toLocaleString()}</b> trips today</span>`];
    if (stopsN) bits.push(`<span><b>${stopsN}</b> stops</span>`);
    if (km) bits.push(`<span><b>${km.toFixed(1)}</b> km</span>`);
    if (run) bits.push(`<span><b>${Math.round(run / 60)}</b> min end-to-end</span>`);
    if (run && km) bits.push(`<span><b>${Math.round(km / (run / 3600))}</b> km/h avg</span>`);
    if (stats.headway) {
      const hw = stats.headway >= 10 ? Math.round(stats.headway) : stats.headway.toFixed(1);
      bits.push(`<span><b>~${hw}</b> min headway at peak (${String(stats.peakHour).padStart(2, '0')}:00)</span>`);
    }
    if (stats.trips) bits.push(`<span><b>${fmt(stats.first)}</b>–<b>${fmt(stats.last)}</b></span>`);
    else bits.push('<span>not running today</span>');
    bits.push('<span id="rNow"></span>');
    $('rStats').innerHTML = bits.join('');
  }

  function fillRoutePanel(idx) {
    const key = routeIds[idx];
    const meta = D.routes[key] || {};
    const stats = routeStats(idx);
    $('rName').textContent = (meta.s ? meta.s + ' · ' : '') + (meta.l || meta.s || key);
    const modeLabel = MODE_LABEL[meta.m] || meta.m;
    const parts = [meta.a, modeLabel].filter(Boolean);
    $('rMeta').textContent = (parts.length === 2 && modeLabel.startsWith(meta.a))
      ? modeLabel : parts.join(' · ');
    $('rDot').style.background = slotColors[routeSlot[idx]];
    updateRouteStats(idx);
  }

  async function selectRoute(idx) {
    if (idx < 0 || idx >= routeIds.length) return;
    selected = idx;
    selStops = null;
    setPanelCollapsed(false);
    $('panelMain').hidden = true;
    $('routePanel').hidden = false;
    const closeBtn = $('rClose');
    if (closeBtn) closeBtn.focus();
    fillRoutePanel(idx);
    state.dirty = true;

    const key = routeIds[idx];
    const cut = key.indexOf(':');
    const feed = key.slice(0, cut);
    const rid = key.slice(cut + 1);
    try {
      let doc = stopsCache.get(feed);
      if (!doc) {
        const res = await fetch(`stops-${feed}.json?v=20261109p`);
        if (res.ok) { doc = await res.json(); stopsCache.set(feed, doc); }
      }
      if (selected !== idx) return;
      const entry = doc && doc.r && doc.r[rid];
      const ids = entry && entry[0];
      if (ids && ids.length >= 2) {
        const n = ids.length;
        selStops = {
          n, lat: new Float32Array(n), lon: new Float32Array(n),
          name: [], x: null, y: null,
          km: entry[1] || 0, run: entry[2] || 0,
        };
        for (let i = 0; i < n; i++) {
          const row = doc.s[ids[i]];
          selStops.lat[i] = row[0];
          selStops.lon[i] = row[1];
          selStops.name.push(row[2]);
        }
        projectStops();
        if (selected === idx) fillRoutePanel(idx);
      }
    } catch { /* panel still shows what we know */ }
    state.dirty = true;
  }

  function clearSelection() {
    if (selected < 0) return;
    selected = -1;
    selStops = null;
    $('panelMain').hidden = false;
    $('routePanel').hidden = true;
    if (mapEl && mapEl.focus) mapEl.focus();
    state.dirty = true;
  }

  function distToPolyline(xy, x, y) {
    let best = Infinity;
    for (let p = 2; p < xy.length; p += 2) {
      const ax = xy[p - 2], ay = xy[p - 1], bx = xy[p], by = xy[p + 1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx, qy = ay + t * dy;
      const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }

  function pickAt(clientX, clientY) {
    const r = overlay.getBoundingClientRect();
    const mx = clientX - r.left, my = clientY - r.top;
    let best = -1, bestD = 13;
    for (let k = 0; k < activeCount; k++) {
      const d = Math.hypot(px[k] - mx, py[k] - my);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best >= 0) { selectRoute(trips[pTrip[best] * 4 + 3]); return; }

    if (state.liveOn && liveScreen && liveCount) {
      const bx = (mx - aff.ox) / aff.sx, by = (my - aff.oy) / aff.sy;
      let lb = -1, ld = 15;
      for (let k = 0; k < liveCount; k++) {
        const d = Math.hypot(liveScreen[k * 4] - bx, liveScreen[k * 4 + 1] - by);
        if (d < ld) { ld = d; lb = k; }
      }
      if (lb >= 0 && liveRoutePtr[lb] >= 0) { selectRoute(liveRoutePtr[lb]); return; }
    }

    const bx = (mx - aff.ox) / aff.sx, by = (my - aff.oy) / aff.sy;
    let hit = -1, hitD = 7;
    for (let i = 0; i < view.screenShapes.length; i++) {
      const route = shapeRoute[i];
      if (route < 0) continue;
      const shape = view.screenShapes[i];
      if (!shape || shape.xy.length < 4) continue;
      if (bx < shape.minx - 8 || bx > shape.maxx + 8 || by < shape.miny - 8 || by > shape.maxy + 8) continue;
      const d = distToPolyline(shape.xy, bx, by);
      if (d < hitD) { hitD = d; hit = route; }
    }
    if (hit >= 0) { selectRoute(hit); return; }
    clearSelection();
  }

  /* ---------- live mode ---------- */

  // The map clock is Toronto schedule time, so a viewer in another zone must
  // not get the snapshot's local-to-them hour (or seek to it).
  function torontoClock(ms) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Toronto', hourCycle: 'h23',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms));
    const out = {};
    for (const p of parts) out[p.type] = p.value;
    const h = +out.hour % 24;
    return {
      h, m: +out.minute, s: +out.second,
      hm: String(h).padStart(2, '0') + ':' + out.minute,
    };
  }

  function liveNoteText() {
    if (!live) return '';
    return `Live snapshot · ${torontoClock(live.generated).hm} · ${live.v.length.toLocaleString()} vehicles`;
  }

  // The RT feeds block browser reads, so a scheduled workflow publishes a
  // snapshot to the live-data branch; raw.githubusercontent serves it with
  // CORS. Same-origin live.json stays first for local runs and manual drops,
  // and the newest of the two wins.
  const LIVE_URLS = [
    'live.json',
    'https://raw.githubusercontent.com/yucombinator/yucombinator.github.io/live-data/live.json',
  ];

  async function loadLive() {
    if (!LIVE_ENABLED) return;
    let doc = null;
    await Promise.all(LIVE_URLS.map(async (base) => {
      try {
        const url = base + (base.includes('?') ? '&' : '?') + 'ts=' + Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return;
        const got = await res.json();
        if (!got || !got.v || !got.v.length) return;
        if (!doc || got.generated > doc.generated) doc = got;
      } catch { /* one source down is fine */ }
    }));
    if (!doc) return;
    live = doc;
    liveRouteSet = new Set(doc.routes || []);
    liveRoutes = new Map();
    for (let r = 0; r < routeIds.length; r++) liveRoutes.set(routeIds[r], routeSlot[r]);
    const age = Date.now() - doc.generated;
    const btn = $('liveBtn');
    if (btn) {
      const stale = age > LIVE_STALE_MS;
      btn.hidden = stale;
      btn.disabled = stale;
      btn.title = stale ? 'Live snapshot expired' : 'Live vehicle positions';
    }
    if (state.liveOn) {
      if (btn && btn.disabled) setLive(false);
      else if ($('liveNote')) { computeLiveScreen(); $('liveNote').textContent = liveNoteText(); }
    }
    state.dirty = true;
  }

  function setLive(on) {
    if (on && !live) return;
    state.liveOn = on;
    if (on) {
      setPlaying(false);
      const c = torontoClock(live.generated);
      seek(c.h * 3600 + c.m * 60 + c.s);
      computeLiveScreen();
    }
    const btn = $('liveBtn');
    if (btn) btn.setAttribute('aria-pressed', String(on));
    if ($('liveNote')) $('liveNote').textContent = on ? liveNoteText() : '';
    state.dirty = true;
    updateUI();
  }

  /* ---------- UI ---------- */

  const fmt = (s) => {
    const hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };

  function startedBefore(t) {
    const count = (x) => {
      let lo = 0, hi = startTimes.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (startTimes[mid] <= x) lo = mid + 1; else hi = mid; }
      return lo;
    };
    // trips starting at 24:xx-30:xx belong to the small hours of the same day
    return count(t) + count(DAY + t) - count(DAY - 1);
  }

  function updateUI() {
    $('clock').textContent = fmt(state.t);
    for (let m = 0; m < MODES.length; m++) {
      const el = $('n-' + MODES[m]);
      if (el) el.textContent = modeTotals[m];
    }
    $('s-active').textContent = activeTotal.toLocaleString();
    $('s-started').textContent = startedBefore(state.t).toLocaleString();
    const rn = $('rNow');
    if (rn) rn.textContent = selectedActive
      ? `${selectedActive} running now`
      : 'no vehicles running at this time';
    $('scrub').value = Math.round(state.t);
  }

  const panelEl = document.querySelector('.panel');

  function setPanelCollapsed(collapsed) {
    panelEl.classList.toggle('collapsed', collapsed);
    const btn = $('panelToggle');
    if (btn) {
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
    }
    try { localStorage.setItem('tim-panel-collapsed', collapsed ? '1' : '0'); } catch { /* private mode */ }
  }

  function setPlaying(on) {
    state.playing = on;
    state.dirty = true;
    const btn = document.querySelector('#speed button[data-play]');
    if (btn) {
      // pressed = paused, so the bar itself carries the state
      btn.setAttribute('aria-pressed', String(!on));
      btn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }
    updateSpeedButtons();
  }

  function updateSpeedButtons() {
    document.querySelectorAll('#speed button[data-speed]').forEach((b) => {
      b.setAttribute('aria-pressed', String(state.playing && +b.dataset.speed === state.speed));
    });
  }

  function seek(t) {
    state.t = Math.max(0, Math.min(DAY - 1, t));
    linesDirty = true;
    state.dirty = true;
    updateUI();
  }

  /* ---------- interaction ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function wire() {

    let down = null;
    mapEl.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    mapEl.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (dx * dx + dy * dy > 36) return;   // a pan, not a click
      pickAt(e.clientX, e.clientY);
    });
    $('rClose').addEventListener('click', clearSelection);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { clearSelection(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea,dialog')) return;
      if (!activeRoutes || !activeRoutes.size) return;
      const list = [...activeRoutes].sort((a, b) => routeIds[a].localeCompare(routeIds[b]));
      const at = list.indexOf(selected);
      const next = at < 0
        ? (e.key === 'ArrowDown' ? list[0] : list[list.length - 1])
        : list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
      selectRoute(next);
      e.preventDefault();
    });

    $('panelToggle').addEventListener('click', () => {
      setPanelCollapsed(!panelEl.classList.contains('collapsed'));
    });
    try {
      if (localStorage.getItem('tim-panel-collapsed') === '1'
          && matchMedia('(max-width: 680px)').matches) {
        setPanelCollapsed(true);
      }
    } catch { /* private mode */ }

    $('days').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-day]');
      if (!btn || btn.dataset.day === curDay) return;
      activateDay(btn.dataset.day);
    });
    $('speed').addEventListener('click', (e) => {
      if (e.target.closest('button[data-play]')) {
        setPlaying(!state.playing);
        return;
      }
      const btn = e.target.closest('button[data-speed]');
      if (!btn) return;
      state.speed = +btn.dataset.speed;
      updateSpeedButtons();
      if (!state.playing) setPlaying(true);
    });
    $('scrub').addEventListener('input', (e) => { setPlaying(false); seek(+e.target.value); });

    $('legend').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      const m = btn.dataset.mode;
      state.modes[m] = !state.modes[m];
      btn.setAttribute('aria-pressed', String(state.modes[m]));
      drawChart();
      state.dirty = true;
    });

    mapEl.addEventListener('pointermove', (e) => {
      const r = overlay.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bestD = 49;
      for (let k = 0; k < activeCount; k++) {
        const d = (px[k] - mx) ** 2 + (py[k] - my) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      const tip = $('tip');

      if (best < 0 && corridors) {
        const bx = (mx - aff.ox) / aff.sx, by = (my - aff.oy) / aff.sy;
        let hitName = null, hitD = 8;
        for (const g of corridors) {
          if (!g.screen) continue;
          for (const xy of g.screen) {
            const d = distToPolyline(xy, bx, by);
            if (d < hitD) { hitD = d; hitName = g.name; }
          }
        }
        if (hitName) {
          state.hover = null;
          state.dirty = true;
          tip.innerHTML = `<div class="m">Busway</div><strong>${esc(hitName)}</strong>`;
          tip.style.display = 'block';
          const tw = tip.offsetWidth, th = tip.offsetHeight;
          tip.style.left = Math.min(window.innerWidth - tw - 8, Math.max(8, e.clientX + 14)) + 'px';
          tip.style.top = Math.max(8, e.clientY - th - 14) + 'px';
          return;
        }
      }

      state.hover = best >= 0 ? best : null;
      state.dirty = true;
      if (best < 0) { tip.style.display = 'none'; return; }
      const ti = pTrip[best];
      const route = D.routes[routeIds[trips[ti * 4 + 3]]];
      const mode = MODES[modeOfTrip[ti]];
      tip.innerHTML = `<div class="m"><span class="cd" style="background:${slotColors[slotOfTrip[ti]]}"></span>${esc(route.a || '')} · ${mode}${route.s ? ' · ' + esc(route.s) : ''}</div><strong>${esc(route.l)}</strong><small>trip ${fmt(trips[ti * 4 + 1])}–${fmt(trips[ti * 4 + 2])}</small>`;
      tip.style.display = 'block';
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(window.innerWidth - tw - 8, Math.max(8, e.clientX + 14)) + 'px';
      tip.style.top = Math.max(8, e.clientY - th - 14) + 'px';
    });
    mapEl.addEventListener('pointerleave', () => { state.hover = null; state.dirty = true; $('tip').style.display = 'none'; });

    chartLine.addEventListener('pointerdown', seekFromChart);
    chartLine.addEventListener('pointermove', (e) => { if (e.buttons) seekFromChart(e); });
    function seekFromChart(e) {
      const r = chartLine.getBoundingClientRect();
      setPlaying(false);
      seek(((e.clientX - r.left) / r.width) * DAY);
    }

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input,select,dialog')) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
      else if (e.key === 'ArrowRight') { setPlaying(false); seek(state.t + (e.shiftKey ? 3600 : 300)); }
      else if (e.key === 'ArrowLeft') { setPlaying(false); seek(state.t - (e.shiftKey ? 3600 : 300)); }
      else if (e.key === 'h' || e.key === 'H') { seek(0); }
    });

    const dlg = $('about');
    $('aboutBtn').addEventListener('click', () => dlg.showModal());
    $('closeAbout').addEventListener('click', () => dlg.close());

    window.addEventListener('resize', resize);
    if (document.fonts?.ready) document.fonts.ready.then(resize);
  }

  /* ---------- boot ---------- */

  async function boot() {
    const res = await fetch('data.json?v=20261109p');
    if (!res.ok) throw new Error('data.json ' + res.status);
    D = await res.json();

    shapes = D.shapes.map((pts) => ({ pts }));

    routeIds = Object.keys(D.routes);
    const colorToSlot = new Map();
    const slotFor = (hex, modeIdx) => {
      let slot = colorToSlot.get(hex);
      if (slot === undefined) {
        slot = slotColors.length;
        colorToSlot.set(hex, slot);
        slotColors.push(hex);
        slotMode.push(modeIdx);
      }
      return slot;
    };

    // one colour slot + mode per route, shared by every service day
    routeIndexByKey = new Map(routeIds.map((k, i) => [k, i]));
    shapeRoute = new Int32Array(D.shapes.length).fill(-1);
    routeSlot = new Uint8Array(routeIds.length);
    routeMode = new Uint8Array(routeIds.length);
    for (let r = 0; r < routeIds.length; r++) {
      const route = D.routes[routeIds[r]];
      const mode = route?.m || 'localbus';
      const modeIdx = Math.max(0, MODES.indexOf(mode));
      const hex = /^[0-9a-f]{6}$/i.test(route?.c || '')
        ? '#' + route.c : MODE_COLOR[MODES[modeIdx]];
      routeMode[r] = modeIdx;
      routeSlot[r] = slotFor(hex, modeIdx);
    }

    slotBuckets = Array.from({ length: slotColors.length }, () => new Int32Array(6000));
    slotCounts = new Uint16Array(slotColors.length);
    px = new Float32Array(6000); py = new Float32Array(6000);
    pAng = new Float32Array(6000); pTrip = new Int32Array(6000);

    // background lines cover every day that has been loaded; a day fetched
    // later adds its own weekend-only shapes when it arrives
    for (const key of D.order) {
      if (D.days[key]) addRailShapes(D.days[key]);
    }

    dayCache = {};
    for (const key of D.order) {
      if (D.days[key]) dayCache[key] = prepareDay(key, D.days[key]);
    }
    activateDay(D.order[0]);

    anchorA = lngLatOf(0, 0);
    anchorB = lngLatOf(1000, 1000);
    loadCorridors();
    if (LIVE_ENABLED) {
      loadLive();
      setInterval(() => { if (state.liveOn) loadLive(); }, 60000);
      setInterval(loadLive, 5 * 60 * 1000);
    }
    resize();
    setPlaying(state.playing);
    seek(state.t);

    mapObj = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/dark',
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      keyboard: false,
      minZoom: 8,
      maxZoom: 15,
      fadeDuration: 200,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
      antialias: false,
    });
    mapObj.on('load', () => {
      mapObj.touchZoomRotate.disableRotation();
      const F = D.fit;
      mapObj.fitBounds([lngLatOf(F[0], F[1]), lngLatOf(F[2], F[3])], {
        padding: { top: 92, bottom: bottomPad(), left: 20, right: 20 },
        duration: 0,
      });
      // fitZoom is the region-wide reference the dot and glow scaling use;
      // the camera then opens on the city instead of the whole GTHA, which
      // was mostly empty Basemap at zoom 8.2.
      fitZoom = mapObj.getZoom();
      mapObj.jumpTo({ center: [-79.383, 43.653], zoom: 9.8 });
      projectPieces();
      needsProjection = false;
      state.dirty = true;
      $('loading').classList.add('done');
    });
    window.__timMap = mapObj;
    mapObj.on('move', () => {
      lastMoveAt = performance.now();
      updateAffine();
      state.dirty = true;
      clearTimeout(exactTimer);
      exactTimer = setTimeout(() => { needsProjection = true; state.dirty = true; }, 140);
    });
    mapObj.on('moveend', () => {
      clearTimeout(exactTimer);
      exactTimer = setTimeout(() => { needsProjection = true; state.dirty = true; }, 60);
    });
    mapObj.on('error', (e) => console.warn('basemap:', e?.error?.message || e));

    last = performance.now();
    requestAnimationFrame(frame);
  }

  wire();
  boot().catch((err) => {
    $('loading').textContent = 'Could not load trip data: ' + err.message;
    console.error('boot failed:', err);
  });
})();
