import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCountryIndex, resolveCountry } from './countryIndex.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const countries = JSON.parse(readFileSync(path.join(here, '..', 'assets', 'geodata', 'countries.json'), 'utf-8')) as Parameters<typeof buildCountryIndex>[0];
const index = buildCountryIndex(countries);

const cases: [number, number, string][] = [
  [20.6, 78.9, 'IN'], // India
  [60, -95, 'CA'], // Canada
  [38, -97, 'US'], // United States
  [-10, -52, 'BR'], // Brazil
  [54, -2, 'GB'], // United Kingdom
  [-25, 134, 'AU'], // Australia
  [36.2, 138.2, 'JP'], // Japan
  [-5.8, 34.85, 'TZ'], // Tanzania center hit from raycast round-trip
];

for (const [lat, lng, iso] of cases) {
  test(`resolveCountry(${lat}, ${lng}) -> ${iso}`, () => {
    const c = resolveCountry(index, lat, lng);
    assert.ok(c, `expected a country for (${lat}, ${lng})`);
    assert.equal(c.iso, iso, `got ${c?.iso} (${c?.n}) instead of ${iso}`);
  });
}

const wrapCases: [number, number, string][] = [
  [-5.806, -325.147, 'TZ'], // raw app output for Tanzania (principal-range longitude)
  [20.6, -281.1, 'IN'], // raw app output for India
  [60, -455, 'CA'], // raw app output for Canada
];

for (const [lat, lng, iso] of wrapCases) {
  test(`resolveCountry wraps raw longitude (${lat}, ${lng}) -> ${iso}`, () => {
    const c = resolveCountry(index, lat, lng);
    assert.ok(c, `expected a country for raw (${lat}, ${lng})`);
    assert.equal(c.iso, iso, `got ${c?.iso} (${c?.n}) instead of ${iso}`);
  });
}

const nullCases: [number, number, string][] = [
  [-40, -30, 'South Atlantic Ocean'],
  [0, -140, 'Pacific Ocean'],
  [55, -170, 'Bering Sea'],
];

for (const [lat, lng, label] of nullCases) {
  test(`resolveCountry(${lat}, ${lng}) -> null (${label})`, () => {
    assert.equal(resolveCountry(index, lat, lng), null);
  });
}

test('index covers the required countries', () => {
  for (const iso of ['IN', 'CA', 'US', 'BR', 'GB', 'AU', 'JP']) {
    assert.ok(index.some((c) => c.iso === iso), `missing ${iso}`);
  }
});

console.log(`[geo] indexed ${index.length} countries with ${index.reduce((s, c) => s + c.rings.length, 0)} rings`);