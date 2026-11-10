import { test, expect } from 'bun:test';
import { buildLive, FEEDS } from '../src/gtfsrt.js';

test('builds a live snapshot from keyless feeds', async () => {
  const doc = await buildLive(1_700_000_000_000);
  expect(doc.generated).toBe(1_700_000_000_000);
  expect(doc.v.length).toBeGreaterThan(100);
  expect(doc.routes.length).toBeGreaterThan(50);
  expect(doc.feeds.length).toBeGreaterThanOrEqual(8);
  for (const row of doc.v) {
    expect(row[0]).toBeGreaterThanOrEqual(0);
    expect(row[0]).toBeLessThan(doc.routes.length);
    expect(Math.abs(row[1])).toBeLessThan(90);
    expect(Math.abs(row[2])).toBeLessThan(180);
    expect(typeof row[5]).toBe('string');
    expect(row[5].length).toBeGreaterThan(0);
  }
  for (const key of doc.routes) {
    expect(key.split(':')[0]).toMatch(/^(ttc|brampton|drt|guelph|hsr|barrie|burlington|grt_bus|grt_lrt|yrt|miway)$/);
  }
});

test('all configured feeds are keyless HTTPS endpoints', () => {
  for (const url of Object.values(FEEDS)) {
    expect(url.startsWith('https://')).toBe(true);
    expect(url).not.toContain('apikey');
    expect(url).not.toContain('token');
  }
});
