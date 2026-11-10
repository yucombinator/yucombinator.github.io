/* Runtime smoke checks for the unified In Motion pages.
   Loaded by the omp eval browser:
     const src = await Bun.file('visualizations/tests/runtime-smoke.js').text();
     eval(src); await runRuntimeSmoke('http://localhost:8741/visualizations');
*/
globalThis.runRuntimeSmoke = async function runRuntimeSmoke(base) {
  const expected = await (await fetch(base + '/tests/runtime-expected.json')).json();
  const results = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const [city, exp] of Object.entries(expected)) {
    const fails = [];
    const tab = await browser.open({
      name: 'smoke-' + city,
      url: `${base}/${city}/?cb=${Date.now()}`,
      viewport: { width: 1280, height: 860 },
    });
    try {
      await tab.waitForSelector('#loading.done', { timeout: 60000 });
      await sleep(1200);

      const got = await tab.evaluate(async () => {
        const play = document.querySelector('#speed button[data-play]');
        if (play.getAttribute('aria-pressed') === 'false') play.click();
        await new Promise((r) => setTimeout(r, 250));
        const s = document.getElementById('scrub');
        s.value = 43200;
        s.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 600));
        const counts = {}, modes = [], tips = {};
        document.querySelectorAll('#legend button[data-mode]').forEach((b) => {
          const mode = b.dataset.mode;
          modes.push(mode);
          counts[mode] = +(b.querySelector('.n')?.textContent || 0);
          const tip = b.querySelector('.mode-tip');
          if (tip) tips[tip.id] = tip.querySelectorAll(':scope > span').length;
        });
        return {
          total: document.getElementById('s-total').textContent,
          started: document.getElementById('s-started').textContent,
          zone: document.getElementById('zone').textContent,
          counts, modes, tips,
          cityLabels: [...document.querySelectorAll('#cityMenu [role="menuitemradio"]')]
            .map((b) => b.textContent.trim()),
          oss: !!document.querySelector('#about a[href*="github.com/yucombinator"]'),
          accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        };
      });

      const eq = (name, a, b) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      };
      eq('total', got.total, exp.total);
      eq('started', got.started, exp.started);
      eq('counts', got.counts, exp.legend);
      eq('legend order', got.modes, exp.legendOrder);
      eq('tip rows', got.tips, exp.tipRows);
      eq('city menu', got.cityLabels, exp.cityLabels);
      if (!got.oss) fails.push('missing open-source link');
      if (got.accent.toLowerCase() !== exp.accent) fails.push(`accent ${got.accent}`);

      for (const id of Object.keys(exp.tipRows)) {
        const mode = exp.legendOrder.find((m) => (m + 'Tip') === id);
        if (!mode) continue;
        await tab.hover(`#legend button[data-mode="${mode}"]`);
        await sleep(200);
        const op = await tab.evaluate((id) => getComputedStyle(document.getElementById(id)).opacity, id);
        if (op !== '1') fails.push(`tooltip ${id} opacity ${op}`);
      }

      if (got.modes.includes('brt')) {
        const toggle = await tab.evaluate(async () => {
          const b = document.querySelector('#legend button[data-mode="brt"]');
          const before = b.getAttribute('aria-pressed');
          b.click(); await new Promise((r) => setTimeout(r, 300));
          const off = b.getAttribute('aria-pressed');
          b.click(); await new Promise((r) => setTimeout(r, 300));
          return { before, off, after: b.getAttribute('aria-pressed') };
        });
        if (toggle.before !== 'true' || toggle.off !== 'false' || toggle.after !== 'true') {
          fails.push(`brt toggle ${JSON.stringify(toggle)}`);
        }
      }

      const sat = await tab.evaluate(async () => {
        const d = await (await fetch('data-saturday.json?v=' + (window.MOTION_VERSION || 'local'))).json();
        document.querySelector('#days button[data-day="saturday"]').click();
        await new Promise((r) => setTimeout(r, 1200));
        const out = {
          label: document.getElementById('dayLabel').textContent,
          total: document.getElementById('s-total').textContent,
          trips: d.trips.length,
        };
        document.querySelector('#days button[data-day="weekday"]').click();
        await new Promise((r) => setTimeout(r, 900));
        return out;
      });
      if (!sat.label.startsWith('Saturday')) fails.push(`saturday label ${sat.label}`);
      if (sat.total !== sat.trips.toLocaleString()) fails.push(`saturday total ${sat.total}`);

      const hover = await tab.evaluate(async () => {
        const play = document.querySelector('#speed button[data-play]');
        if (play.getAttribute('aria-pressed') === 'false') play.click();
        await new Promise((r) => setTimeout(r, 200));
        const clock = document.getElementById('clock').textContent;
        const [hh, mm] = clock.split(':').map(Number);
        const now = hh * 3600 + mm * 60;
        const d = await (await fetch('data.json?v=' + (window.MOTION_VERSION || 'local'))).json();
        const keys = Object.keys(d.routes), day = d.days[d.order[0]], proj = d.proj;
        const pos = (trip, frac) => {
          const pts = d.shapes[trip[0]];
          let L = 0; const seg = [];
          for (let i = 1; i < pts.length; i++) {
            const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            seg.push(s); L += s;
          }
          let goal = frac * L, acc = 0;
          for (let i = 1; i < pts.length; i++) {
            if (acc + seg[i - 1] >= goal) {
              const k = (goal - acc) / (seg[i - 1] || 1);
              const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k;
              const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k;
              const p = window.__timMap.project([(x + proj.x0) / proj.kx, (y + proj.y0) / proj.ky]);
              return [p.x, p.y];
            }
            acc += seg[i - 1];
          }
          return null;
        };
        let trip = null, start = null;
        for (const t of day.trips) {
          if (t[1] > now - 20 || t[2] < now + 180) continue;
          if (d.routes[keys[t[3]]].m !== 'localbus') continue;
          const p = pos(t, (now - t[1]) / (t[2] - t[1]));
          if (!p || p[0] < 120 || p[0] > 1120 || p[1] < 160 || p[1] > 520) continue;
          trip = t; start = p; break;
        }
        if (!trip) return { skip: true };
        document.getElementById('map').dispatchEvent(
          new PointerEvent('pointermove', { clientX: start[0], clientY: start[1], bubbles: true }));
        await new Promise((r) => setTimeout(r, 350));
        const tip = document.getElementById('tip');
        const shown = tip.style.display === 'block' ? tip.textContent.slice(0, 40) : '';
        document.getElementById('scrub').value = String(now + 60);
        document.getElementById('scrub').dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 350));
        const moved = pos(trip, (now + 60 - trip[1]) / (trip[2] - trip[1]));
        const cv = document.getElementById('overlay');
        const ctx = cv.getContext('2d');
        const dpr = cv.width / cv.clientWidth;
        const white = (p) => {
          const px = Math.round(p[0] * dpr), py = Math.round(p[1] * dpr);
          const dd = ctx.getImageData(px - 10, py - 10, 21, 21).data;
          let n = 0;
          for (let i = 0; i < dd.length; i += 4) {
            if (dd[i] > 200 && dd[i + 1] > 200 && dd[i + 2] > 200 && dd[i + 3] > 120) n++;
          }
          return n;
        };
        return { skip: false, shown, ringOld: white(start), ringNew: white(moved) };
      });
      if (!hover.skip && (!hover.shown || hover.ringNew < 5)) {
        fails.push(`hover ring ${JSON.stringify(hover)}`);
      }
    } catch (err) {
      fails.push('exception: ' + String(err).slice(0, 200));
    } finally {
      await browser.close({ name: 'smoke-' + city });
    }
    results.push({ city, pass: fails.length === 0, fails });
  }
  return results;
};
