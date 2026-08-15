import { feature as topoFeature } from 'topojson-client';
import worldCountries from 'world-countries';

// ---------- types ----------

export type GeoRing = number[][]; // [lng, lat][]
export type GeoPoly = GeoRing[];
export type GeoGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: GeoPoly[] | GeoRing[] };

export type GeoRegion = {
  name: string;
  code: string | null; // ISO 3166-2, e.g. IN-UT
  type: string | null; // e.g. "State", "Province"
  geometry: GeoGeometry;
};

export type RegionIndexEntry = {
  code: string | null;
  name: string;
  country: string; // ISO 3166-2 alpha-2
  type: string | null;
  la: number;
  lo: number;
};

export type CountryVector = {
  iso2: string;
  name: string;
  flag: string | null;
  capital: string | null;
  region: string | null;
  subregion: string | null;
  lat: number;
  lng: number;
  geometry: GeoGeometry;
};

export type MapProjection = { k: number; cx: number; cy: number };

// ---------- country lookup helpers ----------

const CCN3_TO_ISO2 = new Map<string, string>();
const COUNTRY_META = new Map<string, { name: string; flag: string | null; capital: string | null; region: string | null; subregion: string | null; latlng: [number, number] }>();
for (const c of worldCountries as { cca2: string; ccn3: string; name: { common: string }; flag: string; capital?: string[]; region?: string; subregion?: string; latlng: number[] }[]) {
  CCN3_TO_ISO2.set(c.ccn3, c.cca2);
  COUNTRY_META.set(c.cca2, {
    name: c.name.common,
    flag: c.flag || null,
    capital: c.capital?.[0] ?? null,
    region: c.region ?? null,
    subregion: c.subregion ?? null,
    latlng: [c.latlng[0], c.latlng[1]],
  });
}

export function countryMeta(iso2: string) {
  return COUNTRY_META.get(iso2) ?? null;
}

// ---------- world-10m country geometry (Natural Earth 10m via world-atlas) ----------

const WORLD_TOPO_URL = new URL('../assets/geodata/world-10m.topojson', import.meta.url).href;

let worldTopoPromise: Promise<{ byIso2: Map<string, CountryVector> }> | null = null;

async function loadWorldTopo(): Promise<{ byIso2: Map<string, CountryVector> }> {
  const res = await fetch(WORLD_TOPO_URL);
  if (!res.ok) throw new Error(`world topo ${res.status}`);
  const topo = await res.json();
  const geojson = topoFeature(topo, topo.objects.countries) as {
    type: 'FeatureCollection';
    features: { type: 'Feature'; id?: string | number; properties?: Record<string, unknown>; geometry: GeoGeometry }[];
  };
  const byIso2 = new Map<string, CountryVector>();
  for (const f of geojson.features) {
    const iso2 = CCN3_TO_ISO2.get(String(f.id));
    if (!iso2) continue;
    const meta = COUNTRY_META.get(iso2);
    if (!meta) continue;
    byIso2.set(iso2, {
      iso2,
      name: meta.name,
      flag: meta.flag,
      capital: meta.capital,
      region: meta.region,
      subregion: meta.subregion,
      lat: meta.latlng[0],
      lng: meta.latlng[1],
      geometry: f.geometry,
    });
  }
  return { byIso2 };
}

export function loadCountryVector(iso2: string): Promise<CountryVector | null> {
  worldTopoPromise ??= loadWorldTopo();
  return worldTopoPromise.then(({ byIso2 }) => byIso2.get(iso2) ?? null);
}

// ---------- admin-1 regions (Natural Earth 10m, bundled per country) ----------

export const ADMIN1_COUNTRIES: readonly string[] = [
  'AR', 'AU', 'BR', 'CA', 'CN', 'DE', 'EG', 'ES', 'FR', 'GB', 'ID', 'IN', 'IT',
  'JP', 'KR', 'MX', 'NG', 'PK', 'RU', 'SA', 'TR', 'UA', 'US', 'ZA',
];

export function hasAdmin1(iso2: string): boolean {
  return ADMIN1_COUNTRIES.includes(iso2);
}

const admin1Cache = new Map<string, Promise<GeoRegion[]>>();

export function loadAdmin1(iso2: string): Promise<GeoRegion[]> {
  if (!hasAdmin1(iso2)) return Promise.resolve([]);
  let p = admin1Cache.get(iso2);
  if (!p) {
    p = (async () => {
      const url = new URL(`../assets/geodata/admin1/${iso2}.geojson`, import.meta.url).href;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`admin1 ${iso2} ${res.status}`);
      const fc = (await res.json()) as {
        features: { properties: { name: string; iso3166_2: string | null; type: string | null }; geometry: GeoGeometry }[];
      };
      return fc.features.map((f) => ({
        name: f.properties.name,
        code: f.properties.iso3166_2,
        type: f.properties.type,
        geometry: f.geometry,
      }));
    })();
    admin1Cache.set(iso2, p);
  }
  return p;
}

// ---------- projection + svg path (equirectangular, always vector) ----------

export function geometryBBox(geometry: GeoGeometry): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const walk = (coords: unknown[]): void => {
    if (typeof coords[0] === 'number') {
      const lng = coords[0] as number;
      const lat = coords[1] as number;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const c of coords) walk(c as unknown[]);
  };
  walk(geometry.coordinates as unknown[]);
  return { minLng, maxLng, minLat, maxLat };
}

export function bboxCenter(b: { minLng: number; maxLng: number; minLat: number; maxLat: number }): { lat: number; lng: number } {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

/** Uniform equirectangular fit of a bbox into width x height with padding (0..0.5). */
export function fitProjection(b: { minLng: number; maxLng: number; minLat: number; maxLat: number }, width: number, height: number, padding = 0.06): MapProjection {
  const dw = Math.max(1e-6, b.maxLng - b.minLng);
  const dh = Math.max(1e-6, b.maxLat - b.minLat);
  const availW = width * (1 - padding * 2);
  const availH = height * (1 - padding * 2);
  const k = Math.min(availW / dw, availH / dh);
  const c = bboxCenter(b);
  return { k, cx: c.lng, cy: c.lat };
}

export function projectPoint(p: MapProjection, width: number, height: number, lng: number, lat: number): { x: number; y: number } {
  return { x: width / 2 + (lng - p.cx) * p.k, y: height / 2 - (lat - p.cy) * p.k };
}

export function geometryToPathD(geometry: GeoGeometry, p: MapProjection, width: number, height: number): string {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates as GeoPoly] : (geometry.coordinates as GeoPoly[]);
  let d = '';
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const pt = projectPoint(p, width, height, ring[i][0], ring[i][1]);
        d += `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
      }
      d += 'Z';
    }
  }
  return d;
}

export function ringToPathD(ring: GeoRing, p: MapProjection, width: number, height: number): string {
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const pt = projectPoint(p, width, height, ring[i][0], ring[i][1]);
    d += `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
  }
  return d + 'Z';
}

// ---------- region index (search) ----------

let regionsIndexPromise: Promise<RegionIndexEntry[]> | null = null;
const REGIONS_INDEX_URL = new URL('../assets/geodata/regions-index.json', import.meta.url).href;

export function loadRegionsIndex(): Promise<RegionIndexEntry[]> {
  regionsIndexPromise ??= (async () => {
    const res = await fetch(REGIONS_INDEX_URL);
    if (!res.ok) throw new Error(`regions index ${res.status}`);
    return (await res.json()) as RegionIndexEntry[];
  })();
  return regionsIndexPromise;
}