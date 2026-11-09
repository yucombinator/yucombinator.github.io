/* Toronto in Motion — scheduled TTC trips animated over a weekday, on a
   MapLibre basemap. Dots are drawn to a canvas overlay that shares the map's
   projection (shape vertices are re-projected whenever the map moves). */
(() => {
  'use strict';

  const MODES = ['subway', 'streetcar', 'lrt', 'gorail', 'gobus', 'localbus', 'up'];
  const MODE_COLOR = {
    subway: '#f8c302', streetcar: '#da251d', lrt: '#f87005',
    gorail: '#00853e', gobus: '#5aa93f', localbus: '#5aa9e6', up: '#3867d6',
  };
  const MODE_RADIUS = {
    subway: 2.7, streetcar: 2.0, lrt: 2.3, gorail: 2.5, gobus: 1.9, localbus: 1.35, up: 2.5,
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
    modes: { subway: true, streetcar: true, lrt: true, gorail: true, gobus: true, localbus: true, up: true },
    hover: null,
    dirty: true,
  };

  let D = null;
  let mapObj = null;
  let shapes = [];            // { pts: [[x,y]] in local metres }
  let routeIds = [];          // pointer -> route_id
  let railShapes = [];        // [{shapeIdx, color}] for background lines
  let slotColors = [];        // palette of dot colours (one per TTC line / mode)
  let slotMode = [];          // mode index per palette slot
  let slotOfTrip = null;      // Uint8Array slot per trip
  let trips = null;           // flat Int32Array [shape, t0, t1, routePtr]
  let tripCount = 0;
  let modeOfTrip = null;      // Uint8Array
  let hourBuckets = null;     // trip indices grouped by start hour
  let startTimes = null;      // sorted Int32Array of t0
  let px = null, py = null, pTrip = null;
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
  let uiAccum = 0;
  let dayCache = {};
  let curDay = null, curHist = null;
  let routeSlot = null, routeMode = null;
  const seenRailShape = new Set();

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
      out[si] = { xy, cum, len };
    }
    view.screenShapes = out;
    baseA = mapObj.project(anchorA);
    baseB = mapObj.project(anchorB);
    aff.sx = aff.sy = 1; aff.ox = aff.oy = 0;
    linesDirty = true;
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

  function drawLines() {
    const { w, h } = view;
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, w, h);
    lctx.lineWidth = 1.1;
    lctx.lineJoin = 'round';
    lctx.lineCap = 'round';
    const ss = view.screenShapes;
    for (const { shapeIdx, color } of railShapes) {
      const shape = ss[shapeIdx];
      const xy = shape && shape.xy;
      if (!xy || xy.length < 4) continue;
      lctx.strokeStyle = color + '5c';
      lctx.beginPath();
      lctx.moveTo(xy[0], xy[1]);
      if (xy.length === 4) {
        lctx.lineTo(xy[2], xy[3]);
      } else {
        // quadratic through segment midpoints: same path, rounded corners
        for (let p = 2; p < xy.length - 2; p += 2) {
          lctx.quadraticCurveTo(xy[p], xy[p + 1], (xy[p] + xy[p + 2]) / 2, (xy[p + 1] + xy[p + 3]) / 2);
        }
        lctx.lineTo(xy[xy.length - 2], xy[xy.length - 1]);
      }
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
    return [ax + (bx - ax) * k, ay + (by - ay) * k];
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

    lineCtx.clearRect(0, 0, chartLine.clientWidth, chartLine.clientHeight);
    const cx = (state.t / DAY) * chartLine.clientWidth;
    lineCtx.strokeStyle = 'rgba(110,231,183,.85)';
    lineCtx.lineWidth = 1;
    lineCtx.beginPath(); lineCtx.moveTo(cx, 0); lineCtx.lineTo(cx, chartLine.clientHeight); lineCtx.stroke();
    lineCtx.fillStyle = 'rgba(110,231,183,.9)';
    lineCtx.beginPath(); lineCtx.arc(cx, chartLine.clientHeight - 2, 2.5, 0, Math.PI * 2); lineCtx.fill();

    uiAccum += dt;
    if (uiAccum > 0.12) { updateUI(); uiAccum = 0; }

    requestAnimationFrame(frame);
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
    const hEnd = t / 3600 | 0;
    for (let back = 0, mask = 0; back <= 4; back++) {
      const hh = (hEnd - back + 24) % 24;
      if (mask & (1 << hh)) continue;
      mask |= 1 << hh;
      const bucket = hourBuckets[hh];
      for (let j = 0; j < bucket.length; j++) {
        const i = bucket[j];
        const t0 = trips[i * 4 + 1], t1 = trips[i * 4 + 2];
        if (t < t0 || t > t1) continue;
        const mode = modeOfTrip[i];
        if (!state.modes[MODES[mode]]) continue;
        activeTotal++;
        modeTotals[mode]++;
        const shape = ss[trips[i * 4]];
        if (!shape || shape.len === 0) continue;
        const [bx, by] = pointAtScreen(shape, (t - t0) / (t1 - t0));
        const X = bx * aff.sx + aff.ox, Y = by * aff.sy + aff.oy;
        if (X < -10 || Y < -10 || X > w + 10 || Y > h + 10) continue;
        if (activeCount >= px.length) continue;
        px[activeCount] = X; py[activeCount] = Y; pTrip[activeCount] = i;
        activeCount++;
      }
    }

    const z = mapObj ? mapObj.getZoom() : fitZoom;
    const zf = Math.min(1.6, Math.max(0.72, Math.pow(1.22, z - fitZoom)));

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
      octx.beginPath();
      for (let k = 0; k < activeCount; k++) {
        if (slotOfTrip[pTrip[k]] !== si) continue;
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
      octx.globalAlpha = isBus(mode) ? 0.85 : 1;
      const r = MODE_RADIUS[mode] * zf;
      octx.beginPath();
      for (let k = 0; k < activeCount; k++) {
        if (slotOfTrip[pTrip[k]] !== si) continue;
        if (isTrain(mode) || isBus(mode)) octx.rect(px[k] - r, py[k] - r, r * 2, r * 2);
        else { octx.moveTo(px[k] + r, py[k]); octx.arc(px[k], py[k], r, 0, Math.PI * 2); }
      }
      octx.fill();
    }
    octx.globalAlpha = 1;

    // thin rim on rail dots so Line 6 grey and Line 4 magenta read on the map
    octx.lineWidth = 0.8;
    octx.strokeStyle = 'rgba(255,255,255,.30)';
    for (let si = 0; zf >= 0.95 && si < slotColors.length; si++) {
      const mode = MODES[slotMode[si]];
      if (isBus(mode) || !state.modes[mode]) continue;
      const r = MODE_RADIUS[mode] * zf + 0.3;
      octx.beginPath();
      for (let k = 0; k < activeCount; k++) {
        if (slotOfTrip[pTrip[k]] !== si) continue;
        if (isTrain(mode)) octx.rect(px[k] - r, py[k] - r, r * 2, r * 2);
        else { octx.moveTo(px[k] + r, py[k]); octx.arc(px[k], py[k], r, 0, Math.PI * 2); }
      }
      octx.stroke();
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
    chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawChart();
    needsProjection = true;
    state.dirty = true;
  }

  /* ---------- chart ---------- */

  function drawChart() {
    if (!D || !chart.clientWidth) return;
    const w = chart.clientWidth, h = chart.clientHeight;
    chartCtx.clearRect(0, 0, w, h);
    const buckets = 144;
    const series = MODES.map((m) => curHist?.[m] || new Array(buckets).fill(0));
    let max = 0;
    for (let b = 0; b < buckets; b++) {
      let s = 0;
      MODES.forEach((m, i) => { if (state.modes[m]) s += series[i][b]; });
      max = Math.max(max, s);
    }
    if (!max) return;
    const acc = new Array(buckets).fill(0);
    MODES.forEach((m, i) => {
      if (!state.modes[m]) return;
      chartCtx.beginPath();
      chartCtx.moveTo(0, h);
      for (let b = 0; b < buckets; b++) {
        acc[b] += series[i][b];
        chartCtx.lineTo((b / (buckets - 1)) * w, h - (acc[b] / max) * (h - 4));
      }
      chartCtx.lineTo(w, h);
      chartCtx.closePath();
      chartCtx.fillStyle = MODE_COLOR[m] + '2e';
      chartCtx.fill();
      chartCtx.strokeStyle = MODE_COLOR[m] + 'cc';
      chartCtx.lineWidth = 1.1;
      chartCtx.stroke();
    });
  }

  /* ---------- service days ---------- */

  function addRailShapes(dd) {
    for (const [shapeIdx, , , ridx] of dd.trips) {
      const slot = routeSlot[ridx];
      const k = shapeIdx + ':' + slot;
      if (seenRailShape.has(k)) continue;
      seenRailShape.add(k);
      railShapes.push({ shapeIdx, color: slotColors[slot] });
    }
    linesDirty = true;
  }

  function prepareDay(key, dd) {
    const n = dd.trips.length;
    const tripsArr = new Int32Array(n * 4);
    const modes = new Uint8Array(n);
    const slots = new Uint8Array(n);
    const starts = new Int32Array(n);
    const buckets = Array.from({ length: 24 }, () => []);
    for (let i = 0; i < n; i++) {
      const [shape, t0, t1, ridx] = dd.trips[i];
      buckets[Math.min(23, t0 / 3600 | 0)].push(i);
      tripsArr[i * 4] = shape; tripsArr[i * 4 + 1] = t0;
      tripsArr[i * 4 + 2] = t1; tripsArr[i * 4 + 3] = ridx;
      modes[i] = routeMode[ridx];
      slots[i] = routeSlot[ridx];
      starts[i] = t0;
    }
    return {
      key, label: dd.label, date: dd.date, tz: dd.tz,
      trips: tripsArr, n, modeOfTrip: modes, slotOfTrip: slots,
      hourBuckets: buckets, startTimes: starts.slice().sort(), hist: dd.hist,
    };
  }

  async function activateDay(key) {
    if (!dayCache[key]) {
      const btn = document.querySelector(`#days button[data-day="${key}"]`);
      if (btn) btn.setAttribute('aria-busy', 'true');
      try {
        const res = await fetch(`data-${key}.json?v=20261108g`);
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
    $('dayLabel').textContent = d.label;
    $('zone').textContent = d.tz || 'EST';
    $('s-total').textContent = d.n.toLocaleString();
    let bestB = 0, bestV = 0;
    for (let b = 0; b < 144; b++) {
      const v = MODES.reduce((sum, m) => sum + (curHist[m]?.[b] || 0), 0);
      if (v > bestV) { bestV = v; bestB = b; }
    }
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

  /* ---------- UI ---------- */

  const fmt = (s) => {
    const hh = Math.floor(s / 3600) % 24, mm = Math.floor(s / 60) % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };

  function startedBefore(t) {
    let lo = 0, hi = startTimes.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (startTimes[mid] <= t) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function updateUI() {
    $('clock').textContent = fmt(state.t);
    for (let m = 0; m < MODES.length; m++) {
      const el = $('n-' + MODES[m]);
      if (el) el.textContent = modeTotals[m];
    }
    $('s-active').textContent = activeTotal.toLocaleString();
    $('s-started').textContent = startedBefore(state.t).toLocaleString();
    $('scrub').value = Math.round(state.t);
  }

  function setPlaying(on) {
    state.playing = on;
    state.dirty = true;
    $('playBtn').setAttribute('aria-label', on ? 'Pause' : 'Play');
    $('playIcon').innerHTML = on
      ? '<rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/>'
      : '<path d="M4 2.5v11l9-5.5z"/>';
  }

  function seek(t) {
    state.t = Math.max(0, Math.min(DAY - 1, t));
    state.dirty = true;
    updateUI();
  }

  /* ---------- interaction ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function wire() {
    $('playBtn').addEventListener('click', () => setPlaying(!state.playing));

    $('days').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-day]');
      if (!btn || btn.dataset.day === curDay) return;
      activateDay(btn.dataset.day);
    });
    $('speed').addEventListener('change', (e) => { state.speed = +e.target.value; });
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
      if (!activeCount) return;
      const r = overlay.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bestD = 49;
      for (let k = 0; k < activeCount; k++) {
        const d = (px[k] - mx) ** 2 + (py[k] - my) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      state.hover = best >= 0 ? best : null;
      state.dirty = true;
      const tip = $('tip');
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
    const res = await fetch('data.json?v=20261108g');
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
    routeSlot = new Uint8Array(routeIds.length);
    routeMode = new Uint8Array(routeIds.length);
    for (let r = 0; r < routeIds.length; r++) {
      const route = D.routes[routeIds[r]];
      const mode = route?.m || 'localbus';
      const modeIdx = Math.max(0, MODES.indexOf(mode));
      const hex = route?.c ? '#' + route.c : MODE_COLOR[MODES[modeIdx]];
      routeMode[r] = modeIdx;
      routeSlot[r] = slotFor(hex, modeIdx);
    }

    px = new Float32Array(6000); py = new Float32Array(6000); pTrip = new Int32Array(6000);

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
      fitZoom = mapObj.getZoom();
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
