import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, MapPin, Minus, Plus, RotateCcw, ArrowLeft, Info, Loader2 } from 'lucide-react';
import {
  loadCountryVector,
  geometryBBox,
  fitProjection,
  geometryToPathD,
  type CountryVector,
  type GeoRegion,
  type MapProjection,
} from '../lib/geoMap';

const IDENTITY: MapProjection = { k: 1, cx: 0, cy: 0 };

// Countries whose full bbox (incl. distant territories) would make a useless initial fit.
const FOCUS_OVERRIDE: Record<string, { minLng: number; maxLng: number; minLat: number; maxLat: number }> = {
  US: { minLng: -125, maxLng: -66, minLat: 24, maxLat: 50 },
  FR: { minLng: -5.5, maxLng: 9.5, minLat: 41, maxLat: 51.5 },
};

interface CountryMapViewProps {
  country: { iso2: string; name: string; flag: string | null };
  regions: GeoRegion[];
  selectedRegion: GeoRegion | null;
  onSelectRegion: (region: GeoRegion | null) => void;
  onBackToWorld: () => void;
  onTogglePanel: () => void;
  focusRequest?: { type: 'region'; code?: string; lat: number; lng: number } | { type: 'point' | 'city'; lat: number; lng: number } | null;
}

export const CountryMapView: React.FC<CountryMapViewProps> = ({
  country,
  regions,
  selectedRegion,
  onSelectRegion,
  onBackToWorld,
  onTogglePanel,
  focusRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: 460 });
  const [vector, setVector] = useState<CountryVector | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<GeoRegion | null>(null);

  // animated projection state
  const targetRef = useRef<MapProjection>({ k: 1, cx: 0, cy: 0 });
  const [proj, setProj] = useState<MapProjection>({ k: 1, cx: 0, cy: 0 });
  const projRef = useRef(proj);
  projRef.current = proj;

  const fitK = useMemo(() => {
    if (!vector) return 1;
    const b = FOCUS_OVERRIDE[country.iso2] ?? geometryBBox(vector.geometry);
    return fitProjection(b, size.w, size.h, 0.08).k;
  }, [vector, size, country.iso2]);

  // load country geometry
  useEffect(() => {
    let cancelled = false;
    setVector(null);
    setError(null);
    loadCountryVector(country.iso2)
      .then((v) => {
        if (cancelled) return;
        if (!v) {
          setError('Country geometry unavailable');
          return;
        }
        setVector(v);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [country.iso2]);

  // observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setTarget = useCallback((p: MapProjection) => {
    targetRef.current = p;
  }, []);

  // initial fit + smooth animation loop
  useEffect(() => {
    if (!vector) return;
    const b = FOCUS_OVERRIDE[country.iso2] ?? geometryBBox(vector.geometry);
    setTarget(fitProjection(b, size.w, size.h, 0.08));
  }, [vector, size, country.iso2, setTarget]);

  useEffect(() => {
    let raf: number;
    const step = () => {
      raf = requestAnimationFrame(step);
      const t = targetRef.current;
      const c = projRef.current;
      const k = c.k + (t.k - c.k) * 0.16;
      const cx = c.cx + (t.cx - c.cx) * 0.16;
      const cy = c.cy + (t.cy - c.cy) * 0.16;
      if (Math.abs(k - t.k) < 1e-6 && Math.abs(cx - t.cx) < 1e-7 && Math.abs(cy - t.cy) < 1e-7) {
        if (k !== t.k || cx !== t.cx || cy !== t.cy) setProj(t);
        return;
      }
      setProj({ k, cx, cy });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // focus requests (search navigation)
  useEffect(() => {
    if (!focusRequest || !vector) return;
    if (focusRequest.type === 'region') {
      const r = regions.find((x) => x.code === focusRequest.code);
      if (r) {
        onSelectRegion(r);
        const b = geometryBBox(r.geometry);
        const p = fitProjection(b, size.w, size.h, 0.16);
        setTarget({ k: Math.max(p.k, fitK * 1.6), cx: p.cx, cy: p.cy });
      }
    } else {
      const p = fitProjection(geometryBBox(vector.geometry), size.w, size.h, 0.08);
      setTarget({ k: Math.max(p.k * 3.2, fitK * 3), cx: focusRequest.lng, cy: focusRequest.lat });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.type, focusRequest && 'code' in focusRequest ? focusRequest.code : undefined, focusRequest?.lat, focusRequest?.lng, vector, regions]);

  // ---- interactions ----
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: projRef.current.cx, cy: projRef.current.cy, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    setTarget({ k: projRef.current.k, cx: d.cx - dx / projRef.current.k, cy: d.cy + dy / projRef.current.k });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const zoomBy = (factor: number, anchor?: { x: number; y: number }) => {
    const c = projRef.current;
    const nextK = Math.min(40000, Math.max(fitK, c.k * factor));
    if (!anchor) {
      setTarget({ k: nextK, cx: c.cx, cy: c.cy });
      return;
    }
    // keep the point under the cursor fixed: lngLat = f(screen), then re-project at new k
    const lng = c.cx + (anchor.x - size.w / 2) / c.k;
    const lat = c.cy - (anchor.y - size.h / 2) / c.k;
    const nk = nextK;
    const cx = lng - (anchor.x - size.w / 2) / nk;
    const cy = lat + (anchor.y - size.h / 2) / nk;
    setTarget({ k: nk, cx, cy });
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    zoomBy(e.deltaY < 0 ? 1.25 : 0.8, anchor);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitK, size]);

  const fitCountry = () => {
    if (!vector) return;
    const b = FOCUS_OVERRIDE[country.iso2] ?? geometryBBox(vector.geometry);
    setTarget(fitProjection(b, size.w, size.h, 0.08));
    onSelectRegion(null);
  };

  const onRegionClick = (r: GeoRegion) => {
    onSelectRegion(r);
    const b = geometryBBox(r.geometry);
    const p = fitProjection(b, size.w, size.h, 0.16);
    setTarget({ k: Math.max(p.k, fitK * 1.6), cx: p.cx, cy: p.cy });
  };

  const regionCentroid = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const r of regions) {
      const b = geometryBBox(r.geometry);
      map.set(r.name, { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 });
    }
    return map;
  }, [regions]);

  const countryPathD = useMemo(() => {
    if (!vector) return '';
    return geometryToPathD(vector.geometry, IDENTITY, size.w, size.h);
  }, [vector, size]);

  const regionPaths = useMemo(() => {
    const items: { region: GeoRegion; d: string; cx: number; cy: number }[] = [];
    for (const r of regions) {
      const d = geometryToPathD(r.geometry, IDENTITY, size.w, size.h);
      const c = regionCentroid.get(r.name);
      items.push({ region: r, d, cx: c ? c.lng : 0, cy: c ? c.lat : 0 });
    }
    return items;
  }, [regions, regionCentroid, size]);

  const transform = `translate(${size.w / 2} ${size.h / 2}) scale(${proj.k}) translate(${-(proj.cx + size.w / 2)} ${proj.cy - size.h / 2})`;

  const hoverName = hover?.name ?? null;
  const selectedName = selectedRegion?.name ?? null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-20 flex flex-col bg-[#02060f] overflow-hidden select-none">
      {/* header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a2c4a] bg-[#060c1a]/95 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{country.flag ?? ''}</span>
          <span className="font-mono text-xs font-bold text-white truncate">{country.name.toUpperCase()}</span>
          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">VECTOR MAP · NATURAL EARTH 10M</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={onTogglePanel} title="Country information" className="flex items-center gap-1 px-2 py-1 rounded border border-[#1d3b63] bg-[#0b1526] text-[10px] font-mono text-cyan-300 hover:bg-[#12203a] cursor-pointer">
            <Info className="w-3 h-3" /> INFO
          </button>
          <button onClick={() => zoomBy(1.4)} title="Zoom in" className="px-2 py-1 rounded border border-[#1d3b63] bg-[#0b1526] text-cyan-300 hover:bg-[#12203a] cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => zoomBy(1 / 1.4)} title="Zoom out" className="px-2 py-1 rounded border border-[#1d3b63] bg-[#0b1526] text-cyan-300 hover:bg-[#12203a] cursor-pointer">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={fitCountry} title="Fit country" className="px-2 py-1 rounded border border-[#1d3b63] bg-[#0b1526] text-cyan-300 hover:bg-[#12203a] cursor-pointer">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onBackToWorld} className="flex items-center gap-1 px-2.5 py-1 rounded border border-cyan-700 bg-cyan-950/70 text-[10px] font-mono font-bold text-cyan-200 hover:bg-cyan-900 cursor-pointer">
            <ArrowLeft className="w-3 h-3" /> WORLD
          </button>
        </div>
      </div>

      {/* map surface */}
      <div className="relative flex-1 overflow-hidden" style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}>
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-slate-500">{error}</div>
        ) : !vector ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-[11px] font-mono text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> LOADING VECTOR GEOMETRY…
          </div>
        ) : (
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            className="absolute inset-0"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <rect width={size.w} height={size.h} fill="#040a18" />
            <g transform={transform}>
              {/* country outline */}
              <path d={countryPathD} fill="#0b1626" stroke="#2b4c7a" strokeWidth={0.35} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {/* regions */}
              {regionPaths.map(({ region: r, d }, i) => {
                const isSel = r.name === selectedName;
                const isHov = r.name === hoverName;
                return (
                  <path
                    key={`${r.name}-${i}`}
                    d={d}
                    fill={isSel ? '#0f6d84' : isHov ? '#12324d' : '#101f36'}
                    stroke={isSel ? '#22d3ee' : isHov ? '#38bdf8' : '#1c3b5e'}
                    strokeWidth={isSel ? 0.7 : 0.28}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    onMouseEnter={() => setHover(r)}
                    onMouseLeave={() => setHover(null)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      onRegionClick(r);
                    }}
                  />
                );
              })}
              {/* selected region label (screen-fixed, outside the projected group) */}
            </g>
            {selectedRegion && (
              <text x={size.w / 2} y={34} textAnchor="middle" fontSize={13} fill="#a5f3fc" fontFamily="monospace" fontWeight="bold">
                {selectedRegion.name.toUpperCase()}
              </text>
            )}
          </svg>
        )}

        {/* hover chip */}
        {hoverName && hoverName !== selectedName && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none text-[10px] font-mono text-cyan-200 bg-[#04101f]/85 backdrop-blur px-2.5 py-1 rounded border border-cyan-800/60">
            {hoverName} — click to focus
          </div>
        )}
      </div>

      {/* footer hint */}
      <div className="px-3 py-1.5 border-t border-[#16253f] bg-[#060c18]/95 flex items-center justify-between text-[9px] font-mono text-slate-500 z-10">
        <span className="flex items-center gap-1">
          <Globe className="w-3 h-3" /> Drag to pan · scroll to zoom · click a region to drill down
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3" /> Vector geometry — sharp at any zoom
        </span>
      </div>
    </div>
  );
};

export default CountryMapView;