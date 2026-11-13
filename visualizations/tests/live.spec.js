import { test, expect } from '@playwright/test';

test('production serves current assets and usable mobile schedule entry', async ({ page, request }) => {
  await page.goto('/visualizations/seattle-in-motion/?cb=production');
  await expect(page.locator('#scheduleToggle')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#scheduleToggle')).toHaveText('Routes');

  const version = await page.evaluate(() => window.MOTION_VERSION || '');
  expect(version).toMatch(/^[a-f0-9]{12}$/);
  const schedule = await request.get('/visualizations/seattle-in-motion/schedules/0.json');
  expect(schedule.status()).toBe(200);
  const doc = await schedule.json();
  const dataRes = await request.get('/visualizations/seattle-in-motion/data.json');
  expect(dataRes.status()).toBe(200);
  const data = await dataRes.json();
  expect(doc.route).toBe(Object.keys(data.routes)[0]);
  expect(Array.isArray(doc.days.weekday.runs)).toBe(true);

  await page.locator('#scheduleToggle').click();
  await expect(page.locator('#schQuery')).toBeFocused();
  await page.locator('#schQuery').fill('2 Line');
  await expect(page.locator('#schResults [data-route-index]').first()).toBeVisible();
});
