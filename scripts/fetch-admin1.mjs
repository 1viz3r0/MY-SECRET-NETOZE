// One-time data build: split Natural Earth 10m Admin-1 into per-country GeoJSON.
// Input: ne_10m_admin_1_states_provinces.geojson (public domain, Natural Earth).
// Output: src/assets/geodata/admin1/<ISO2>.geojson (quantized to 0.001 deg, minimal props).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
const outDir = path.join(here, '..', 'src', 'assets', 'geodata', 'admin1');
if (!src || !existsSync(src)) {
  console.error('usage: node scripts/fetch-admin1.mjs <ne_10m_admin_1_states_provinces.geojson>');
  process.exit(1);
}

// alpha-3 (NE adm0_a3) -> alpha-2 (ISO 3166-1)
const ADM0 = {
  IND: 'IN', USA: 'US', CAN: 'CA', GBR: 'GB', BRA: 'BR', AUS: 'AU', DEU: 'DE',
  FRA: 'FR', JPN: 'JP', CHN: 'CN', RUS: 'RU', MEX: 'MX', ZAF: 'ZA', ITA: 'IT',
  ESP: 'ES', IDN: 'ID', NGA: 'NG', PAK: 'PK', ARG: 'AR', KOR: 'KR', TUR: 'TR',
  EGY: 'EG', SAU: 'SA', UKR: 'UA',
};

const world = JSON.parse(readFileSync(src, 'utf-8'));
console.log('world features:', world.features.length);

const byCountry = new Map();
for (const f of world.features) {
  const a3 = f.properties.adm0_a3;
  const iso2 = ADM0[a3];
  if (!iso2) continue;
  const name = f.properties.name;
  const iso3166_2 = f.properties.iso_3166_2;
  const type = f.properties.type_en || f.properties.type || null;
  if (!name) continue;
  if (!byCountry.has(iso2)) byCountry.set(iso2, []);
  byCountry.get(iso2).push({ name, iso3166_2, type, geometry: f.geometry });
}

mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [iso2, features] of byCountry) {
  // quantize coordinates to 0.001 deg
  const q = (v) => Math.round(v * 1000) / 1000;
  const quantize = (geom) => {
    if (geom.type === 'Polygon') {
      return { type: 'Polygon', coordinates: geom.coordinates.map((ring) => ring.map((p) => [q(p[0]), q(p[1])])) };
    }
    if (geom.type === 'MultiPolygon') {
      return { type: 'MultiPolygon', coordinates: geom.coordinates.map((poly) => poly.map((ring) => ring.map((p) => [q(p[0]), q(p[1])]))) };
    }
    return null;
  };
  const cleaned = features
    .map((f) => ({ ...f, geometry: quantize(f.geometry) }))
    .filter((f) => f.geometry);
  const fc = { type: 'FeatureCollection', features: cleaned.map((f) => ({ type: 'Feature', properties: { name: f.name, iso3166_2: f.iso3166_2 ?? null, type: f.type }, geometry: f.geometry })) };
  const file = path.join(outDir, `${iso2}.geojson`);
  writeFileSync(file, JSON.stringify(fc));
  total += fc.features.length;
  console.log(`${iso2}: ${fc.features.length} regions -> ${file}`);
}

// Compact search index: { code, name, country (iso2), type, la, lo } per region (centroid from bbox).
const bboxCenter = (geom) => {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coords) walk(c);
  };
  walk(geom.coordinates);
  return { la: (minLat + maxLat) / 2, lo: (minLng + maxLng) / 2 };
};
const index = [];
for (const [iso2, features] of byCountry) {
  for (const f of features) {
    const c = bboxCenter(f.geometry);
    index.push({ code: f.iso3166_2 ?? null, name: f.name, country: iso2, type: f.type, la: Math.round(c.la * 100) / 100, lo: Math.round(c.lo * 100) / 100 });
  }
}
writeFileSync(path.join(outDir, '..', 'regions-index.json'), JSON.stringify(index));
console.log(`regions index: ${index.length} entries -> src/assets/geodata/regions-index.json`);