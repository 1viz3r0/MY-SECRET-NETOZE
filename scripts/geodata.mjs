/**
 * Generates compact globe datasets from npm packages:
 *   - world-countries  -> country boundary rings (lat/lng) + ISO codes
 *   - country-timezones-> IANA timezone names per ISO-2 country code
 *
 * Output:
 *   - src/assets/geodata/countries.json   [{ n, iso, la, lo, polys }]
 *   - src/assets/geodata/timezones.json   { "US": ["America/New_York", ...] }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src', 'assets', 'geodata');

function loadFirst(...candidates) {
  for (const c of candidates) {
    const p = path.join(root, 'node_modules', ...c);
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  }
  throw new Error(`none of the candidate files exist: ${candidates.join(' | ')}`);
}

const round = (v) => Math.round(v * 1000) / 1000;

function ringPoints(ring) {
  // ring: [[lng, lat], ...] (closed); drop duplicated closing point
  const pts = ring.map(([lng, lat]) => [round(lng), round(lat)]);
  if (pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  return pts;
}

function geometryToPolys(geometry) {
  if (!geometry || geometry.type === 'Point') return [];
  const coords =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return coords
    .map((poly) => poly.map((ring) => ringPoints(ring)).filter((r) => r.length >= 3))
    .filter((polys) => polys.length > 0);
}

function bboxOf(polys) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const poly of polys) for (const ring of poly) for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

const meta = loadFirst(['world-countries', 'countries.json']);
const byIso = new Map();
const byNumeric = new Map();
for (const e of meta) {
  const n3 = String(e.ccn3 || '');
  if (n3 && e.cca2) byNumeric.set(n3, e);
  if (e.cca2) byIso.set(String(e.cca2).toUpperCase(), e);
}

function flagEmoji(iso) {
  if (!/^[A-Z]{2}$/.test(iso)) return '';
  return String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// world-atlas countries 110m (topology), decoded with topojson-client
const topo = loadFirst(['world-atlas', 'countries-110m.json']);
const { feature } = await import('topojson-client');
const features = feature(topo, topo.objects.countries).features;

const countries = [];
for (const f of features) {
  const numericId = String(f.id ?? '');
  const metaEntry = byNumeric.get(numericId) ?? byIso.get(String(numericId).toUpperCase());
  const iso = metaEntry?.cca2 ? String(metaEntry.cca2).toUpperCase() : '';
  const name = metaEntry?.name?.common || metaEntry?.name || '';
  if (!iso || !name) continue;
  const geometry = f.geometry;
  if (!geometry || geometry.type === 'Point') continue;
  const polys = geometryToPolys(geometry);
  if (polys.length === 0) continue;
  const bb = bboxOf(polys);
  const capitals = metaEntry?.capital;
  const latlng = Array.isArray(metaEntry?.latlng) && metaEntry.latlng.length >= 2 ? metaEntry.latlng : null;
  countries.push({
    n: name,
    iso,
    la: latlng ? round(latlng[0]) : round((bb.minLat + bb.maxLat) / 2),
    lo: latlng ? round(latlng[1]) : round((bb.minLng + bb.maxLng) / 2),
    polys,
    ...(Array.isArray(capitals) && capitals.length ? { cap: capitals[0] } : {}),
    ...(metaEntry?.region ? { r: metaEntry.region } : {}),
    ...(metaEntry?.subregion ? { sr: metaEntry.subregion } : {}),
    ...(flagEmoji(iso) ? { fl: flagEmoji(iso) } : {}),
  });
}

let tzData = null;
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const moment = require('moment-timezone');
  const zonesByCountry = {};
  for (const c of meta) {
    const iso = String(c.cca2 || '');
    const zones = moment.tz.zonesForCountry(iso);
    if (zones && zones.length) zonesByCountry[iso] = zones;
  }
  tzData = zonesByCountry;
} catch {
  tzData = null;
}

const timezones = {};
if (Array.isArray(tzData)) {
  for (const t of tzData) {
    const iso = String(t.iso2 ?? t.iso ?? t.code ?? '').toUpperCase();
    const name = t.tz_name ?? t.timezone ?? t.tzName ?? '';
    if (!iso || !name) continue;
    (timezones[iso] = timezones[iso] || []).push(name);
  }
} else if (tzData && typeof tzData === 'object') {
  for (const [code, names] of Object.entries(tzData)) {
    const iso = String(code).toUpperCase();
    if (Array.isArray(names) && names.length) timezones[iso] = names;
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'countries.json'), JSON.stringify(countries), 'utf8');
writeFileSync(path.join(outDir, 'timezones.json'), JSON.stringify(timezones), 'utf8');

const kb = (p) => Math.round(statSize(path.join(outDir, p)) / 1024);
function statSize(p) {
  const s = requireStat(p);
  return s;
}
function requireStat(p) {
  return readFileSync(p).length;
}

console.log(`countries: ${countries.length} -> countries.json (${kb('countries.json')} KB)`);
console.log(`timezones: ${Object.keys(timezones).length} countries -> timezones.json (${kb('timezones.json')} KB)`);