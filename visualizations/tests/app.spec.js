import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function load(page) {
  await page.goto('/seattle-in-motion/?test=1');
  await expect(page.locator('#loading')).toHaveClass(/done/, { timeout: 45_000 });
  await page.evaluate(() => window.__timSchedule.setTime(8 * 3600));
}

test('desktop schedule route, run, and search', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop-specific schedule flow');
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
  test.skip(isMobile, 'landscape-specific drawer geometry');
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
  test.skip(isMobile, 'time formatter is viewport-independent');
  await load(page);
  const label = await page.evaluate(() => window.__timFmtNext(90000));
  expect(label).toBe('+1 01:00');
});

test('mobile touch selects a route line', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch-only map interaction');
  await load(page);
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
  test.skip(isMobile, 'desktop DOM scan');
  await load(page);
  await page.evaluate(() => window.__timSchedule.openRouteByKey('puget:2LINE'));
  await expect(page.locator('#schedulePanel')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include('#schedulePanel')
    .disableRules(['color-contrast'])
    .analyze();
  expect(results.violations).toEqual([]);
});
