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
    } catch (err) {
      fails.push('exception: ' + String(err).slice(0, 200));
    } finally {
      await browser.close({ name: 'schedule-' + city });
    }
    results.push({ city, pass: fails.length === 0, fails });
  }
  return results;
};
