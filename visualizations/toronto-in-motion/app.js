/* Toronto in Motion — scheduled TTC trips animated over a weekday. */
(() => {
  'use strict';

  const MODES = ['subway', 'streetcar', 'bus'];
  const MODE_COLOR = { subway: '#f5c451', streetcar: '#ef6f6c', bus: '#5aa9e6' };
  const MODE_RADIUS = { subway: 2.7, streetcar: 2.0, bus: 1.45 };
  const DAY = 86400;

  const $ = (id) => document.getElementById(id);
  const map = $('map');
  const ctx = map.getContext('2d');
  const chart = $('chart');
  const chartCtx = chart.getContext('2d');
  const chartLine = $('chartline');
  const lineCtx = chartLine.getContext('2d');

  const state = {
    t: 7 * 3600,
    playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    speed: 120,
    modes: { subway: true, streetcar: true, bus: true },
    hover: null,
    dirty: true,
  };

  let D = null;
  let shapes = [];          // { pts: [[x,y]], cum: Float64Array, len }
  let trips = null;         // flat Int32Array [shape, t0, t1, routePtr]
  let tripCount = 0;
  let modeOfTrip = null;    // Uint8Array
  let startTimes = null;    // sorted Int32Array of t0
  let railShapes = [];      // [{shape, mode}] precomputed for background lines
  let routeIds = [];        // pointer -> route_id
  let px = null, py = null, pTrip = null; // per-frame dot positions
  let activeCount = 0;
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  let last = 0;
  let uiAccum = 0;

  /* ---------- geometry ---------- */

  function prepareShapes(raw) {
    return raw.map((pts) => {
      const cum = new Float64Array(pts.length);
      let len = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0];
        const dy = pts[i][1] - pts[i - 1][1];
        len += Math.hypot(dx, dy);
        cum[i] = len;
      }
      return { pts, cum, len };
    });
  }

  function pointAt(shape, frac) {
    const target = frac * shape.len;
    const { pts, cum } = shape;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    const i = Math.max(1, lo);
    const seg = cum[i] - cum[i - 1] || 1;
    const k = (target - cum[i - 1]) / seg;
    const a = pts[i - 1], b = pts[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = map.clientWidth, h = map.clientHeight;
    view.dpr = dpr; view.w = w; view.h = h;
    map.width = Math.round(w * dpr); map.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (D) {
      const F = D.fit || D.bbox;
      const W = F[2] - F[0], H = F[3] - F[1];
      const padTop = h * 0.14, padBottom = h * 0.23, padX = w * 0.035;
      const s = Math.min((w - padX * 2) / W, (h - padTop - padBottom) / H);
      view.scale = s;
      view.ox = (w - W * s) / 2 - F[0] * s;
      view.oy = padTop + (h - padTop - padBottom - H * s) / 2 + F[3] * s;
    }

    const cw = chart.clientWidth, ch = chart.clientHeight;
    chart.width = Math.round(cw * dpr); chart.height = Math.round(ch * dpr);
    chartLine.width = chart.width; chartLine.height = chart.height;
    chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChart();
    state.dirty = true;
  }

  const sx = (x) => view.ox + x * view.scale;
  const sy = (y) => view.oy - y * view.scale;

  /* ---------- frame ---------- */

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;

    if (state.playing) {
      state.t += dt * state.speed;
      if (state.t >= DAY) state.t -= DAY;
      state.dirty = true;
    }

    if (state.dirty) {
      draw();
      state.dirty = false;
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
    ctx.clearRect(0, 0, w, h);

    // faint route lines for rail modes (precomputed list)
    ctx.lineWidth = 1;
    for (const { shapeIdx, mode } of railShapes) {
      const shape = shapes[shapeIdx];
      if (!shape || shape.pts.length < 2) continue;
      ctx.strokeStyle = mode === 0 ? 'rgba(245,196,81,.20)' : 'rgba(239,111,108,.16)';
      ctx.beginPath();
      for (let p = 0; p < shape.pts.length; p++) {
        const X = sx(shape.pts[p][0]), Y = sy(shape.pts[p][1]);
        if (p === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }

    // dots
    activeCount = 0;
    const t = state.t;
    for (let i = 0; i < tripCount; i++) {
      const t0 = trips[i * 4 + 1], t1 = trips[i * 4 + 2];
      if (t < t0 || t > t1) continue;
      const mode = modeOfTrip[i];
      if (!state.modes[MODES[mode]]) continue;
      const shapeIdx = trips[i * 4];
      const shape = shapes[shapeIdx];
      if (!shape || shape.len === 0) continue;
      const frac = (t - t0) / (t1 - t0);
      const [x, y] = pointAt(shape, frac);
      const X = sx(x), Y = sy(y);
      if (X < -10 || Y < -10 || X > w + 10 || Y > h + 10) continue;
      px[activeCount] = X; py[activeCount] = Y; pTrip[activeCount] = i;
      activeCount++;
    }

    for (const mode of MODES) {
      if (!state.modes[mode]) continue;
      ctx.fillStyle = MODE_COLOR[mode];
      ctx.globalAlpha = mode === 'bus' ? 0.82 : 1;
      const r = MODE_RADIUS[mode];
      ctx.beginPath();
      for (let k = 0; k < activeCount; k++) {
        if (modeOfTrip[pTrip[k]] !== MODES.indexOf(mode)) continue;
        ctx.moveTo(px[k] + r, py[k]);
        ctx.arc(px[k], py[k], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.hover != null && state.hover < activeCount) {
      const k = state.hover;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px[k], py[k], 7, 0, Math.PI * 2); ctx.stroke();
    }
  }

  /* ---------- chart ---------- */

  function drawChart() {
    if (!D || !chart.clientWidth) return;
    const w = chart.clientWidth, h = chart.clientHeight;
    chartCtx.clearRect(0, 0, w, h);
    const buckets = 144;
    const series = MODES.map((m) => D.hist[m] || new Array(buckets).fill(0));
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
    const counts = { subway: 0, streetcar: 0, bus: 0 };
    for (let k = 0; k < activeCount; k++) counts[MODES[modeOfTrip[pTrip[k]]]]++;
    $('n-subway').textContent = counts.subway;
    $('n-streetcar').textContent = counts.streetcar;
    $('n-bus').textContent = counts.bus;
    $('s-active').textContent = activeCount.toLocaleString();
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

  function wire() {
    $('playBtn').addEventListener('click', () => setPlaying(!state.playing));

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

    map.addEventListener('pointermove', (e) => {
      if (!activeCount) return;
      const r = map.getBoundingClientRect();
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
      tip.innerHTML = `<div class="m">${mode}${route.s ? ' · ' + esc(route.s) : ''}</div><strong>${esc(route.l)}</strong><small>trip ${fmt(trips[ti * 4 + 1])}–${fmt(trips[ti * 4 + 2])}</small>`;
      tip.style.display = 'block';
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(window.innerWidth - tw - 8, Math.max(8, mx + r.left + 14)) + 'px';
      tip.style.top = Math.max(8, my + r.top - th - 12) + 'px';
    });
    map.addEventListener('pointerleave', () => { state.hover = null; state.dirty = true; $('tip').style.display = 'none'; });

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

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- boot ---------- */

  async function boot() {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error('data.json ' + res.status);
    D = await res.json();

    shapes = prepareShapes(D.shapes);

    routeIds = Object.keys(D.routes);
    const routePtr = new Map(routeIds.map((id, i) => [id, i]));
    tripCount = D.trips.length;
    trips = new Int32Array(tripCount * 4);
    modeOfTrip = new Uint8Array(tripCount);
    const starts = new Int32Array(tripCount);
    for (let i = 0; i < tripCount; i++) {
      const [shape, t0, t1, rid] = D.trips[i];
      trips[i * 4] = shape; trips[i * 4 + 1] = t0; trips[i * 4 + 2] = t1; trips[i * 4 + 3] = routePtr.get(rid) ?? 0;
      const mode = D.routes[rid]?.m || 'bus';
      modeOfTrip[i] = MODES.indexOf(mode === 'subway' ? 'subway' : mode === 'streetcar' ? 'streetcar' : 'bus');
      starts[i] = t0;
    }
    startTimes = starts.slice().sort();

    px = new Float32Array(6000); py = new Float32Array(6000); pTrip = new Int32Array(6000);

    const seenShape = new Set();
    for (let i = 0; i < tripCount; i++) {
      const mode = modeOfTrip[i];
      if (mode === 2) continue;
      const shapeIdx = trips[i * 4];
      const key = shapeIdx + ':' + mode;
      if (seenShape.has(key)) continue;
      seenShape.add(key);
      railShapes.push({ shapeIdx, mode });
    }

    // peak hour from the histogram
    let bestB = 0, bestV = 0;
    const buckets = 144;
    for (let b = 0; b < buckets; b++) {
      const v = MODES.reduce((s, m) => s + (D.hist[m]?.[b] || 0), 0);
      if (v > bestV) { bestV = v; bestB = b; }
    }
    const peakHour = String(Math.floor(bestB / 6)).padStart(2, '0') + ':00';
    document.querySelector('.stats').children[2].innerHTML = `Peak hour <b>${peakHour}</b> · ${Math.round(bestV).toLocaleString()} vehicles`;

    $('zone').textContent = 'EST';
    resize();
    setPlaying(state.playing);
    seek(state.t);
    $('loading').classList.add('done');
    last = performance.now();
    requestAnimationFrame(frame);
  }

  wire();
  boot().catch((err) => {
    $('loading').textContent = 'Could not load trip data: ' + err.message;
    console.error(err);
  });
})();
