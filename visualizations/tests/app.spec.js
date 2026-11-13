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

test('mobile touch selects a route line', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch-only map interaction');
  await load(page);
  await page.waitForFunction(() => !!window.__timMap, null, { timeout: 15_000 });
  const point = await page.evaluate(async () => {
    const version = window.MOTION_VERSION || 'local';
    const data = await (await fetch('/seattle-in-motion/data.json?v=' + version)).json();
    const routeIndex = Object.keys(data.routes).indexOf('puget:2LINE');
    const trip = data.days.weekday.trips.find((row) => row[3] === routeIndex);
    const shape = data.shapes[trip[0]];
    const p = shape[Math.floor(shape.length / 2)];
    const lon = (p[0] + data.proj.x0) / data.proj.kx;
    const lat = (p[1] + data.proj.y0) / data.proj.ky;
    window.__timMap.jumpTo({ center: [lon, lat], zoom: 13 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const screen = window.__timMap.project([lon, lat]);
    return { x: screen.x, y: screen.y };
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('#scheduleToggle')).toHaveText('Show schedule', { timeout: 10_000 });
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
