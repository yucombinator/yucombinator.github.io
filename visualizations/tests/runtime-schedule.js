/* Focused browser checks for the schedule drawer. */
globalThis.runScheduleSmoke = async function runScheduleSmoke(base) {
  const results = [];
  const cities = [
    'seattle-in-motion',
    'toronto-in-motion',
    'vancouver-in-motion',
    'san-francisco-in-motion',
  ];
  for (const city of cities) {
    const fails = [];
    const tab = await browser.open({
      name: 'schedule-' + city,
      url: `${base}/${city}/?cb=${Date.now()}`,
      viewport: { width: 1280, height: 860 },
    });
    try {
      await tab.waitForSelector('#loading.done', { timeout: 60000 });
      await tab.evaluate(() => window.__timSchedule?.openRouteByIndex(0));
      await tab.waitForSelector('#schedulePanel:not([hidden])', { timeout: 15000 });
      await tab.waitForSelector('#schBody .sched-run, #schBody .sched-empty', { timeout: 15000 });
      const got = await tab.evaluate(async () => {
        const panel = document.getElementById('schedulePanel');
        const body = document.getElementById('schBody');
        const runs = body ? body.querySelectorAll('[data-run-index]').length : 0;
        return {
          panel: !!panel,
          hidden: panel.hidden,
          name: document.getElementById('schName')?.textContent || '',
          body: body?.textContent || '',
          runs,
          search: !!document.getElementById('scheduleSearch'),
          oldPanel: !!document.getElementById('routePanel'),
        };
      });
      if (!got.panel || got.hidden) fails.push('schedule panel did not open');
      if (!got.name) fails.push('route name missing');
      if (!got.search) fails.push('search button missing');
      if (got.oldPanel) fails.push('old route panel still exists');
      if (!got.runs && !/no runs|not running|no timetable/i.test(got.body)) {
        fails.push('route mode has neither runs nor an empty state');
      }
      if (city === 'seattle-in-motion') {
        await tab.evaluate(() => window.__timSchedule.openLiveRouteByIndex(0));
        await tab.waitForSelector('.sched-live-note', { timeout: 10000 });
        const live = await tab.evaluate(() => document.querySelector('.sched-live-note')?.textContent || '');
        if (!/live vehicle/i.test(live)) fails.push('live route context missing: ' + live);
        await tab.evaluate(() => window.__timSchedule.openRouteByIndex(0));
      }
      if (city === 'seattle-in-motion' && got.runs) {

        const run = await tab.evaluate(() => {
          const b = document.querySelector('#schBody [data-run-index]');
          return b ? { i: +b.dataset.runIndex, start: +b.dataset.runStart } : null;
        });
        if (run) {
          await tab.evaluate((start) => {
            const s = document.getElementById('scrub');
            s.value = String(start + 60);
            s.dispatchEvent(new Event('input', { bubbles: true }));
          }, run.start);
          await tab.evaluate((i) => window.__timSchedule.openRunByIndex(0, i), run.i);
          await tab.waitForSelector('#schBody .sched-stop', { timeout: 10000 });
          const active = await tab.evaluate(() => ({
            text: document.getElementById('schRunState')?.textContent || '',
            following: window.__timSchedule.state().following,
          }));
          if (!/following/i.test(active.text) || !active.following) {
            fails.push('active run did not enter following state: ' + JSON.stringify(active));
          }
          await tab.evaluate(() => {
            const b = document.getElementById('schBody');
            b.scrollTop = b.scrollHeight;
            b.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
          });
          await tab.waitForSelector('#schRecenter:not([hidden])', { timeout: 5000 });
          await tab.evaluate(() => document.getElementById('schRecenter').click());
          await new Promise((r) => setTimeout(r, 250));
          const visible = await tab.evaluate(() => {
            const b = document.getElementById('schBody');
            const n = document.querySelector('.sched-next');
            if (!n) return false;
            const br = b.getBoundingClientRect(), nr = n.getBoundingClientRect();
            return nr.top >= br.top && nr.bottom <= br.bottom;
          });
          if (!visible) fails.push('recenter did not bring the next stop into view');
          await tab.evaluate(() => window.__timSchedule.close());
          const closed = await tab.evaluate(() => window.__timSchedule.state());
          if (closed.open !== false || closed.following !== true) {
            fails.push('closing drawer did not preserve follow: ' + JSON.stringify(closed));
          }
          await tab.evaluate((start) => {
            const s = document.getElementById('scrub');
            s.value = String(Math.max(0, start - 60));
            s.dispatchEvent(new Event('input', { bubbles: true }));
          }, run.start);
          await tab.evaluate((i) => window.__timSchedule.openRunByIndex(0, i), run.i);
          await tab.waitForSelector('#schBody .sched-stop', { timeout: 10000 });
          const inactive = await tab.evaluate(() => ({
            text: document.getElementById('schRunState')?.textContent || '',
            following: window.__timSchedule.state().following,
          }));
          if (!/not active/i.test(inactive.text) || inactive.following) {
            fails.push('inactive run entered follow: ' + JSON.stringify(inactive));
          }
        }
      }
      if (city === 'seattle-in-motion') {
        const cycling = await tab.evaluate(() => {
          const map = document.getElementById('map');
          map.focus();
          const name = () => document.getElementById('schName')?.textContent || '';
          const before = name();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          const one = name();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
          return { before, one, after: name(), focus: document.activeElement?.id };
        });
        if (cycling.one === cycling.before || cycling.after === cycling.one) {
          fails.push('keyboard route cycling stopped after first step: ' + JSON.stringify(cycling));
        }
        await tab.evaluate(() => document.getElementById('scheduleSearch').click());

        await tab.waitForSelector('#schQuery', { timeout: 10000 });
        const focused = await tab.evaluate(() => document.activeElement?.id);
        if (focused !== 'schQuery') fails.push('search input not focused: ' + focused);
        await tab.evaluate(() => {
          const input = document.getElementById('schQuery');
          input.value = 'Reservation';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await tab.waitForSelector('#schResults [data-route-index]', { timeout: 10000 });
        const count = await tab.evaluate(() => document.querySelectorAll('#schResults [data-route-index]').length);
        if (!count) fails.push('route search returned no results');
        await tab.evaluate(() => document.querySelector('#schResults [data-route-index]').click());
        await tab.waitForSelector('#schBody [data-run-index], #schBody .sched-empty', { timeout: 10000 });
        const selected = await tab.evaluate(() => window.__timSchedule.state().mode);
        if (selected !== 'route') fails.push('search result did not open route mode: ' + selected);
        await tab.evaluate(() => document.getElementById('scheduleSearch').click());
        await tab.waitForSelector('#schQuery', { timeout: 10000 });
        await tab.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        const afterEscape = await tab.evaluate(() => window.__timSchedule.state().mode);
        if (afterEscape !== 'route') fails.push('search escape did not return to route mode: ' + afterEscape);
      }
      if (city === 'toronto-in-motion') {
        const shared = await tab.evaluate(async () => {
          const v = window.MOTION_VERSION || 'local';
          const doc = await (await fetch('schedules/135.json?v=' + v)).json();
          for (const run of doc.days.weekday.runs) {
            const other = doc.days.saturday.runs.find((r) => r.trip === run.trip && r.start === run.start);
            if (other) return { i: run.i, trip: run.trip, start: run.start, saturdayI: other.i };
          }
          return null;
        });
        if (!shared) {
          fails.push('no cross-day run found for Toronto route 135');
        } else {
          await tab.evaluate((x) => window.__timSchedule.openRunByIndex(135, x.i), shared);
          await tab.waitForSelector('#schBody .sched-stop', { timeout: 10000 });
          await tab.evaluate(() => document.querySelector('#days button[data-day="saturday"]').click());
          await tab.waitForSelector('#days button[data-day="saturday"][aria-pressed="true"]', { timeout: 15000 });
          await tab.waitForSelector('#schBody .sched-stop', { timeout: 10000 });
          const state = await tab.evaluate(() => {
            const s = window.__timSchedule.state();
            return { mode: s.mode, runKey: s.runKey, runIndex: s.runIndex };
          });
          if (state.mode !== 'run') fails.push('cross-day run lost run mode: ' + JSON.stringify(state));
          if (!Array.isArray(state.runKey) || state.runKey[0] !== shared.trip
              || state.runKey[1] !== shared.start) {
            fails.push('cross-day run key changed: ' + JSON.stringify(state));
          }
          if (state.runIndex !== shared.saturdayI) {
            fails.push('cross-day run index not remapped: ' + JSON.stringify(state));
          }
        }
      }
    } catch (err) {
      fails.push('exception: ' + String(err).slice(0, 200));
    } finally {
      await browser.close({ name: 'schedule-' + city });
    }
    results.push({ city, pass: fails.length === 0, fails });
  }
  {
    const fails = [];
    const tab = await browser.open({
      name: 'schedule-mobile',
      url: `${base}/seattle-in-motion/?cb=${Date.now()}`,
      viewport: { width: 390, height: 844 },
    });
    try {
      await tab.waitForSelector('#loading.done', { timeout: 60000 });
      await tab.evaluate(() => window.__timSchedule?.openRouteByIndex(0));
      await tab.waitForSelector('#schBody .sched-run, #schBody .sched-empty', { timeout: 15000 });
      const box = await tab.evaluate(() => {
        const el = document.getElementById('schedulePanel');
        const r = el.getBoundingClientRect();
        const close = document.getElementById('schClose').getBoundingClientRect();
        return { width: r.width, left: r.left, right: r.right, top: r.top, viewport: innerWidth,
          closeTop: close.top, closeBottom: close.bottom, viewportH: innerHeight };
      });
      if (box.width > box.viewport - 12) fails.push('mobile drawer too wide: ' + JSON.stringify(box));
      if (box.left < 0 || box.right > box.viewport) fails.push('mobile drawer outside viewport: ' + JSON.stringify(box));
      if (box.top < 0) fails.push('mobile drawer clipped above viewport: ' + JSON.stringify(box));
      if (box.closeTop < 0 || box.closeBottom > box.viewportH) fails.push('mobile close button unreachable: ' + JSON.stringify(box));
    } catch (err) {
      fails.push('exception: ' + String(err).slice(0, 200));
    } finally {
      await browser.close({ name: 'schedule-mobile' });
    }
    results.push({ city: 'schedule-mobile', pass: fails.length === 0, fails });
  }
  return results;
};
