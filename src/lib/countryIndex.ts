export type CountryPolyData = {
  n: string;
  iso: string;
  la: number;
  lo: number;
  polys: number[][][][]; // [polygon][ring][ [lng, lat] ]
};

export type GeoRingIndex = {
  lng: Float64Array;
  lat: Float64Array;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

export type CountryIndexEntry = {
  iso: string;
  n: string;
  la: number;
  lo: number;
  rings: GeoRingIndex[];
};

export function buildCountryIndex(countries: CountryPolyData[]): CountryIndexEntry[] {
  const out: CountryIndexEntry[] = [];
  for (const c of countries) {
    const rings: GeoRingIndex[] = [];
    for (const poly of c.polys) {
      for (const ring of poly) {
        if (ring.length < 3) continue;
        const lngArr = new Float64Array(ring.length);
        const latArr = new Float64Array(ring.length);
        let minLng = Infinity;
        let maxLng = -Infinity;
        let minLat = Infinity;
        let maxLat = -Infinity;
        for (let i = 0; i < ring.length; i++) {
          const lng = ring[i][0];
          const lat = ring[i][1];
          lngArr[i] = lng;
          latArr[i] = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        if (maxLng - minLng >= 180) continue; // ring crosses the antimeridian: skip (avoids false selects)
        rings.push({ lng: lngArr, lat: latArr, minLng, maxLng, minLat, maxLat });
      }
    }
    if (rings.length === 0) continue;
    out.push({ iso: c.iso, n: c.n, la: c.la, lo: c.lo, rings });
  }
  return out;
}

function pointInRingLngLat(lng: number, lat: number, r: GeoRingIndex): boolean {
  const { lng: xs, lat: ys, minLng, maxLng, minLat, maxLat } = r;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    const xi = xs[i];
    const yi = ys[i];
    const xj = xs[j];
    const yj = ys[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function resolveCountry(index: CountryIndexEntry[], lat: number, lng: number): CountryIndexEntry | null {
  const lngNorm = ((lng + 180) % 360 + 360) % 360 - 180; // normalize [-360,360] outputs to [-180,180]
  for (const entry of index) {
    for (const r of entry.rings) {
      if (
        r.minLat <= lat &&
        lat <= r.maxLat &&
        r.minLng <= lngNorm &&
        lngNorm <= r.maxLng &&
        pointInRingLngLat(lngNorm, lat, r)
      ) {
        return entry;
      }
    }
  }
  return null;
}