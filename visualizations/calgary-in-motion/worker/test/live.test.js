import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildLive, FEEDS, parseFeed } from '../src/gtfsrt.js';

const index = JSON.parse(
  readFileSync(new URL('../../live-trips.json', import.meta.url)),
);

test('builds a live snapshot from the keyless Calgary feed', async () => {
  const doc = await buildLive(index, 1_700_000_000_000);
  expect(doc.generated).toBe(1_700_000_000_000);
  expect(doc.v.length).toBeGreaterThan(20);
  expect(doc.routes.length).toBeGreaterThan(5);
  for (const row of doc.v) {
    expect(row[0]).toBeGreaterThanOrEqual(0);
    expect(row[0]).toBeLessThan(doc.routes.length);
    expect(Math.abs(row[1])).toBeLessThan(90);
    expect(Math.abs(row[2])).toBeLessThan(180);
    expect(typeof row[5]).toBe('string');
    expect(row[5].startsWith('calgary:')).toBe(true);
  }
  for (const key of doc.routes) expect(key.startsWith('calgary:')).toBe(true);
});

function varintBytes(value) {
  const out = [];
  let v = value;
  while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  out.push(v);
  return out;
}

test('parser reads timestamp from field 4, not the congestion field', () => {
  // FeedEntity { vehicle(4): VehiclePosition { timestamp(4) = 1700000000 } }
  const ts = varintBytes(1_700_000_000);
  const vehicle = [0x20, ...ts];                        // field 4, varint
  const entity = [0x22, vehicle.length, ...vehicle];    // FeedEntity.vehicle
  const feed = [0x12, entity.length, ...entity];        // FeedMessage.entity
  const rows = parseFeed(Uint8Array.from(feed));
  expect(rows.length).toBe(1);
  expect(rows[0].ts).toBe(1_700_000_000);
  expect(rows[0].lat).toBe(null);
});

test('the feed is keyless and HTTPS', () => {
  for (const url of Object.values(FEEDS)) {
    expect(url.startsWith('https://')).toBe(true);
    expect(url).not.toContain('apikey');
    expect(url).not.toContain('token');
  }
});
