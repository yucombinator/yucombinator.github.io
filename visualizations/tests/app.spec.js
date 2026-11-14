import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function load(page) {
  await page.goto('/seattle-in-motion/?test=1');
  await expect(page.locator('#scheduleToggle')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.__timSchedule.setTime(8 * 3600));
}

test('desktop schedule route, run, and search', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop-specific schedule flow');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  await expect(page.locator('#schName')).toContainText('2 Line');
  await expect(page.locator('#schBody .sched-run').first()).toBeVisible();
  await expect(page.locator('#schBody .sched-run .sr-dest').first()).toContainText('(');

  await page.locator('#schBody .sched-run').first().click();
  await expect(page.locator('#schRunState')).toBeVisible();
  await expect(page.locator('#schBody .sched-stop').first()).toBeVisible();

  await page.locator('#scheduleSearch').click();
  await expect(page.locator('#schQuery')).toBeFocused();
  await page.locator('#schQuery').fill('2 Line');
  await expect(page.locator('#schResults [data-route-index]').first()).toBeVisible();
  await page.locator('#schResults [data-route-index]').first().click();
  await expect(page.locator('#schName')).toContainText('2 Line');
});

test('mobile cold load exposes Routes and opens search', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-specific schedule entry');
  await load(page);
  const toggle = page.locator('#scheduleToggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText('Routes');
  await toggle.click();
  await expect(page.locator('#schQuery')).toBeFocused();
  await expect(page.locator('#schedulePanel')).toBeVisible();

  await page.locator('#schQuery').fill('2 Line');
  await page.locator('#schResults [data-route-index]').first().click();
  await expect(page.locator('#schedulePanel')).toBeVisible();
  await expect(page.locator('#schCloseBottom')).toBeVisible();
  await page.locator('#schCloseBottom').click();
  await expect(page.locator('#schedulePanel')).toBeHidden();
  await expect(page.locator('#scheduleToggle')).toBeVisible();
});

test('landscape drawer keeps a usable height and reachable close', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'landscape', 'landscape-specific drawer geometry');
  await page.setViewportSize({ width: 844, height: 390 });
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  const box = await page.locator('#schedulePanel').boundingBox();
  const close = await page.locator('#schClose').boundingBox();
  expect(box.height).toBeGreaterThan(160);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(close.y).toBeGreaterThanOrEqual(0);
  expect(close.y + close.height).toBeLessThanOrEqual(390);
});

test('overnight labels are explicit', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'time formatter is viewport-independent');
  await load(page);
  const label = await page.evaluate(() => window.__timFmtNext(90000));
  expect(label).toBe('+1 01:00');
});

test('drawer has no non-color accessibility violations', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop DOM scan');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('#schedulePanel')
    .disableRules(['color-contrast'])
    .analyze();
  expect(results.violations).toEqual([]);
});

function roleContrast(rgb, bg) {
  const lum = ([r, g, b]) => {
    const c = [r, g, b].map((x) => {
      x /= 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = lum(rgb), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('light-theme drawer accent text meets contrast', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop drawer scan');
  await page.addInitScript(() => localStorage.setItem('motion-theme', 'light'));
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#scheduleSearch')).toBeVisible();
  const ratio = await page.evaluate(() => {
    const el = document.getElementById('scheduleSearch');
    const parse = (value) => value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    const panel = document.getElementById('schedulePanel');
    return [parse(getComputedStyle(el).color), parse(getComputedStyle(panel).backgroundColor)];
  });
  expect(roleContrast(ratio[0], ratio[1])).toBeGreaterThanOrEqual(4.5);
});

test('opening route mode focuses the drawer heading', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop focus check');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schName')).toBeFocused();
});

test('search ranks exact route and exposes result count', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop search check');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#scheduleSearch')).toBeVisible();
  await page.locator('#scheduleSearch').click();
  await page.locator('#schQuery').fill('2 Line');
  await expect(page.locator('#schResults [role="option"]').first()).toContainText('2 Line');
  await expect(page.locator('#schCount')).toContainText('of');
});

test('future tooltip does not duplicate target and uses the project color', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop future tooltip check');
  await load(page);
  const result = await page.evaluate(() => {
    const project = window.MOTION_CONFIG.future.find((p) => p.id === 'swift-gold');
    return { text: window.__timSchedule.futureTip('swift-gold'), color: project.color };
  });
  expect(result.text).toContain('Swift Gold Line');
  expect(result.text).not.toMatch(/target \d{4} target/i);
  expect(result.color).toBe('#d4a72c');
});

test('run state follows the scrubber without entering follow', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop state synchronization');
  await load(page);
  const routeIndex = await page.evaluate(() => window.__timSchedule.routeIndex('puget:2LINE'));
  await page.evaluate((i) => window.__timSchedule.openRouteByKey('puget:2LINE'), routeIndex);
  const first = await page.evaluate(() => {
    const row = document.querySelector('#schBody [data-run-index]');
    return { i: +row.dataset.runIndex, start: +row.dataset.runStart };
  });
  await page.evaluate(() => window.__timSchedule.setTime(0));
  await page.evaluate(({ routeIndex, first }) => window.__timSchedule.openRunByIndex(routeIndex, first.i),
    { routeIndex, first });
  await expect(page.locator('#schRunState')).toContainText('Not active');
  await page.evaluate(({ start }) => window.__timSchedule.setTime(start + 60), first);
  await expect(page.locator('#schRunState')).toContainText('Scheduled');
});

test('drawer close button stays pinned to the top right', async ({ page, isMobile }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop drawer header geometry');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  const box = await page.locator('#schedulePanel').boundingBox();
  const close = await page.locator('#schClose').boundingBox();
  expect(close.x + close.width).toBeGreaterThanOrEqual(box.x + box.width - 24);
  expect(close.y).toBeLessThan(box.y + 36);
});

test('schedule toggle is hidden while the drawer is open', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop toggle visibility');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  await expect(page.locator('#scheduleToggle')).toBeHidden();
  await page.evaluate(() => window.__timSchedule.close());
  await expect(page.locator('#scheduleToggle')).toBeVisible();
});

test('day payload failure shows a retry state', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop day failure');
  await load(page);
  await page.route('**/data-saturday.json*', (route) => route.abort());
  await page.locator('#days button[data-day="saturday"]').click();
  await expect(page.locator('#dayError')).toBeVisible();
  await expect(page.locator('#dayRetry')).toBeVisible();
});

test('large route exposes a current-time jump and collapsible groups', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop large-route check');
  await page.goto('/toronto-in-motion/?test=1');
  await expect(page.locator('#scheduleToggle')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.__timSchedule.setTime(12 * 3600));
  await page.evaluate(() => window.__timSchedule.openRouteByKey('ttc:504'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  await expect(page.locator('#schNow')).toBeVisible();
  await expect(page.locator('#schBody details.sched-group').first()).toBeVisible();
  await page.locator('#schNow').click();
  await expect(page.locator('#schBody .sched-run').first()).toBeVisible();
});

test('following a run chains into an available return run', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop follow chaining');
  await load(page);
  const info = await page.evaluate(async () => {
    const idx = window.__timSchedule.routeIndex('puget:2LINE');
    const v = window.MOTION_VERSION || 'local';
    const doc = await (await fetch(`/seattle-in-motion/schedules/${idx}.json?v=${v}`)).json();
    const runs = doc.days.weekday.runs;
    const current = runs.find((run) => run.dir === 0 && runs.some((next) =>
      next.dir !== run.dir && next.start >= run.end));
    if (!current) return null;
    window.__timSchedule.setTime(current.start + 1);
    window.__timSchedule.openRunByIndex(idx, current.i);
    await new Promise((resolve) => setTimeout(resolve, 300));
    window.__timSchedule.setTime(current.end - 1);
    window.__timSchedule.play();
    return { trip: current.i };
  });
  test.skip(!info, 'no return pair in fixture');
  await expect.poll(async () => page.evaluate(() => window.__timSchedule.follow()?.trip),
    { timeout: 10_000 }).not.toBe(info.trip);
});

test('Routes sits between the theme control and About in the header', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop header placement');
  await load(page);
  const order = await page.evaluate(() => [...document.querySelector('.hright').children]
    .map((el) => el.id || el.className));
  expect(order.indexOf('scheduleToggle')).toBe(order.indexOf('themeBtn') + 1);
  expect(order.indexOf('scheduleToggle')).toBeLessThan(order.indexOf('aboutBtn'));
});

test('mobile header controls fit in the viewport', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile header geometry');
  await load(page);
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
    order: [...document.querySelector('.hright').children].map((el) => el.id || el.className),
  }));
  expect(box.scroll).toBeLessThanOrEqual(box.viewport);
  expect(box.order.indexOf('scheduleToggle')).toBe(box.order.indexOf('themeBtn') + 1);
  expect(box.order.indexOf('scheduleToggle')).toBeLessThan(box.order.indexOf('aboutBtn'));
});

test('Routes header control matches the About link color', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop header styling');
  await load(page);
  const colors = await page.evaluate(() => {
    const c = (id) => getComputedStyle(document.getElementById(id)).color;
    return { routes: c('scheduleToggle'), about: c('aboutBtn') };
  });
  expect(colors.routes).toBe(colors.about);
});

test('boot survives a delayed Saturday payload', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop boot race');
  await page.route('**/data-saturday.json*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/seattle-in-motion/?test=1');
  await expect(page.locator('#scheduleToggle')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.__timSchedule.setDay('saturday'));
  await expect(page.locator('#loading')).not.toContainText('Could not load trip data', { timeout: 10_000 });
  await page.waitForTimeout(1800);
  await expect(page.locator('#loading')).not.toContainText('Could not load trip data');
});

test('quiet view keeps the network visible', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop low-service map');
  await load(page);
  await page.evaluate(async () => {
    await window.__timSchedule.setDay('saturday');
    window.__timSchedule.setTime(50 * 60);
    window.__timMap.jumpTo({ center: [-122.19, 48.07], zoom: 9.5 });
  });
  await page.waitForTimeout(900);
  const painted = await page.evaluate(() => {
    const el = document.getElementById('rail');
    const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(1000);
});

test('boot paints the map after an async Saturday day load', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop boot rendering');
  await page.clock.install({ time: new Date('2026-11-14T00:50:00-08:00') });
  await page.route('**/data-saturday.json*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/seattle-in-motion/');
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 30_000 });
  await expect.poll(async () => page.evaluate(() => {
    const el = document.getElementById('rail');
    const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) n++;
    return n;
  }), { timeout: 10_000 }).toBeGreaterThan(1000);
});
