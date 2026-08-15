import React, { useEffect, useMemo, useState } from 'react';
import type { LocationNode, CountryGeo } from './Globe3D';
import { Globe, MapPin, Clock, Building2, Landmark, X, Layers, Radio, Wifi, Activity } from 'lucide-react';
import type { ConnectivityStatus } from '../services/tauri/intel';
import timezonesJson from '../assets/geodata/timezones.json';
import admin1MetaJson from '../assets/geodata/admin1-meta.json';
import type { CountryVector, GeoRegion } from '../lib/geoMap';

export interface CountryStats {
  flows: number;
  packets: number;
  bytes: number;
  rttMs: number | null;
  threatMatches: number;
  topSeverity: string | null;
  remoteIps: string[];
  sources: string[];
  resolvedAt: number | null;
  updatedAt: number;
}

interface CountryDetailPanelProps {
  node: LocationNode | null;
  country: CountryGeo | null;
  vector: CountryVector | null;
  regions: GeoRegion[];
  selectedRegion: GeoRegion | null;
  onSelectRegion: (region: GeoRegion | null) => void;
  connectivity: ConnectivityStatus | null;
  stats: CountryStats | null;
  onClose: () => void;
  topOffset?: string;
}

function fmtClock(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return '--:--:--';
  }
}

function fmtDate(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      weekday: 'short',
    }).format(d);
  } catch {
    return '—';
  }
}

function utcOffset(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? null;
  } catch {
    return null;
  }
}

const SEV_COLORS: Record<string, string> = {
  CRITICAL: 'bg-rose-950 text-rose-400 border-rose-800',
  HIGH: 'bg-orange-950 text-orange-400 border-orange-800',
  MEDIUM: 'bg-amber-950 text-amber-400 border-amber-800',
  LOW: 'bg-blue-950 text-blue-400 border-blue-800',
  INFO: 'bg-slate-900 text-slate-400 border-slate-700',
};

const CONN_COLORS: Record<string, string> = {
  ONLINE: 'bg-emerald-950 text-emerald-400 border-emerald-800',
  DEGRADED: 'bg-amber-950 text-amber-400 border-amber-800',
  OFFLINE: 'bg-rose-950 text-rose-400 border-rose-800',
  CONNECTING: 'bg-cyan-950 text-cyan-400 border-cyan-800',
};

const ADMIN1_META = admin1MetaJson as Record<string, { cap?: string; lang?: string }>;

export const CountryDetailPanel: React.FC<CountryDetailPanelProps> = ({
  node,
  country,
  vector,
  regions,
  selectedRegion,
  onSelectRegion,
  connectivity,
  onClose,
  topOffset = '0.75rem',
}) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const tz = useMemo(() => {
    if (!country) return null;
    const zones = (timezonesJson as Record<string, string[]>)[country.iso];
    return zones && zones.length > 0 ? zones[0] : null;
  }, [country]);

  if (!node && !country) return null;

  const sevColor = (s: string) => SEV_COLORS[s] ?? SEV_COLORS.INFO;

  const renderCountry = () => {
    const name = vector?.name ?? country!.name;
    const flag = vector?.flag ?? country!.fl ?? '';
    const cap = vector?.capital ?? null;
    const region = vector?.region ?? null;
    const subregion = vector?.subregion ?? null;
    const offset = tz ? utcOffset(tz) : null;
    const regionMeta = selectedRegion?.code ? ADMIN1_META[selectedRegion.code] : null;
    return (
      <>
        {/* Identity */}
        <div className="flex items-center gap-3 bg-[#0a1428] p-3 rounded border border-[#162744]">
          <div className="w-10 h-10 rounded bg-cyan-950 flex items-center justify-center text-2xl leading-none">
            {flag || country!.iso}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-white font-sans">{name}</span>
            <span className="text-[10px] text-slate-400">
              {country!.iso} • {country!.lat.toFixed(2)}, {country!.lng.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Geographic facts (world-countries reference dataset) */}
        {(cap || region || subregion) && (
          <div className="flex flex-col gap-1.5 bg-[#060c18] p-3 rounded border border-[#15243e]">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-cyan-400" /> GEOGRAPHIC FACTS
            </span>
            {cap && (
              <div className="flex justify-between border-b border-[#142036] py-1">
                <span className="text-slate-400 flex items-center gap-1">
                  <Landmark className="w-3.5 h-3.5 text-slate-500" /> Capital
                </span>
                <span className="text-white font-bold">{cap}</span>
              </div>
            )}
            {region && (
              <div className="flex justify-between border-b border-[#142036] py-1">
                <span className="text-slate-400">Continent</span>
                <span className="text-white font-bold">{region}</span>
              </div>
            )}
            {subregion && (
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Subregion</span>
                <span className="text-white font-bold">{subregion}</span>
              </div>
            )}
          </div>
        )}

        {/* Local time / timezone (IANA tz database via Intl) */}
        <div className="flex flex-col gap-2 bg-[#060c18] p-3 rounded border border-[#15243e]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" /> LOCAL TIME
          </span>
          {tz ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-cyan-300 tracking-wider">
                  {fmtClock(now, tz)}
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-bold border rounded ${offset ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-900 text-slate-400 border-slate-700'}`}>
                  UTC {offset}
                </span>
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>{fmtDate(now, tz)}</span>
                <span>{tz}</span>
              </div>
            </>
          ) : (
            <div className="text-[11px] font-mono text-slate-500">Timezone data unavailable for {country!.iso}</div>
          )}
        </div>

        {/* Regions (Natural Earth 10m Admin-1) — real clickable drill-down */}
        {regions.length > 0 && (
          <div className="flex flex-col gap-2 bg-[#060c18] p-3 rounded border border-[#15243e]">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-cyan-400" /> REGIONS
            </span>
            <div className="max-h-44 overflow-y-auto flex flex-col gap-1 pr-1">
              {regions.map((r) => {
                const isSel = selectedRegion?.name === r.name;
                return (
                  <button
                    key={r.name}
                    onClick={() => onSelectRegion(isSel ? null : r)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded text-left border transition-colors cursor-pointer ${
                      isSel
                        ? 'bg-cyan-900/50 border-cyan-600 text-cyan-100'
                        : 'bg-[#0a1428] border-[#162744] text-slate-300 hover:bg-[#10203a]'
                    }`}
                  >
                    <span className="text-[11px] font-mono">{r.name}</span>
                    {r.type && (
                      <span className="text-[9px] font-mono text-slate-500 uppercase">{r.type}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected region information (only fields with real data) */}
        {selectedRegion && (
          <div className="flex flex-col gap-1.5 bg-[#071b27] p-3 rounded border border-cyan-800/50">
            <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {selectedRegion.name.toUpperCase()}
            </span>
            {selectedRegion.code && (
              <div className="flex justify-between border-b border-[#15303f] py-1">
                <span className="text-slate-400">ISO 3166-2</span>
                <span className="text-white font-bold">{selectedRegion.code}</span>
              </div>
            )}
            {selectedRegion.type && (
              <div className="flex justify-between border-b border-[#15303f] py-1">
                <span className="text-slate-400">Admin level</span>
                <span className="text-white font-bold">{selectedRegion.type}</span>
              </div>
            )}
            {regionMeta?.cap && (
              <div className="flex justify-between border-b border-[#15303f] py-1">
                <span className="text-slate-400">Capital</span>
                <span className="text-white font-bold">{regionMeta.cap}</span>
              </div>
            )}
            {regionMeta?.lang && (
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Language</span>
                <span className="text-white font-bold">{regionMeta.lang}</span>
              </div>
            )}
          </div>
        )}

        {/* Internet connectivity (this node) */}
        <div className="flex flex-col gap-2 bg-[#060c18] p-3 rounded border border-[#15243e]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <Wifi className="w-3.5 h-3.5 text-cyan-400" /> INTERNET CONNECTIVITY
          </span>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">State</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold border rounded ${CONN_COLORS[connectivity?.state ?? ''] ?? 'bg-slate-900 text-slate-400 border-slate-700'}`}>
              {connectivity?.state ?? 'UNKNOWN'}
            </span>
          </div>
          {connectivity?.latency_ms != null && (
            <div className="flex justify-between border-b border-[#142036] py-1">
              <span className="text-slate-400">Latency to Internet</span>
              <span className="text-cyan-400 font-bold">{connectivity.latency_ms} ms</span>
            </div>
          )}
        </div>
      </>
    );
  };

  const renderNode = () => {
    const [city, ...rest] = node!.name.split(', ');
    const countryName = rest.join(', ');
    return (
      <>
        {/* Identity */}
        <div className="flex items-center gap-3 bg-[#0a1428] p-3 rounded border border-[#162744]">
          <div className="w-10 h-10 rounded bg-cyan-950 flex items-center justify-center text-cyan-400 font-bold text-sm">
            {city ? city.substring(0, 2).toUpperCase() : '??'}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white font-sans">{node!.name}</span>
            <span className="text-[10px] text-slate-400">{countryName} • {node!.ip}</span>
          </div>
        </div>

        {/* Observed position (GeoIP) */}
        <div className="flex flex-col gap-2 bg-[#060c18] p-3 rounded border border-[#15243e]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            OBSERVED POSITION (GEOIP)
          </span>
          <div className="flex justify-between border-b border-[#142036] py-1">
            <span className="text-slate-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Coordinates
            </span>
            <span className="text-white font-bold">
              {node!.lat.toFixed(2)}, {node!.lng.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400" /> Active Flows
            </span>
            <span className="text-emerald-400 font-bold">{node!.activeFlowsCount}</span>
          </div>
        </div>

        {/* Live network metrics — real local observation */}
        <div className="flex flex-col gap-2 bg-[#060c18] p-3 rounded border border-[#15243e]">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            LIVE NETWORK METRICS
          </span>
          <div className="flex justify-between border-b border-[#142036] py-1">
            <span className="text-slate-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" /> Packets
            </span>
            <span className="text-emerald-400 font-bold">{node!.pkts}</span>
          </div>
          <div className="flex justify-between border-b border-[#142036] py-1">
            <span className="text-slate-400 flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" /> Latency RTT
            </span>
            <span className="text-cyan-400 font-bold">{node!.rtt}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Threat matching</span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${sevColor(node!.threatLevel)}`}>
              {node!.threatLevel}
            </span>
          </div>
        </div>
      </>
    );
  };

  return (
    <div
      style={{ top: topOffset }}
      className="absolute right-3 z-30 w-80 max-h-[92%] cyber-card bg-[#070e1c]/95 border-cyan-500/70 p-4 shadow-2xl rounded-xl flex flex-col gap-3 font-mono text-xs overflow-y-auto backdrop-blur-lg animate-fadeIn"
    >
      <div className="flex items-center justify-between border-b border-[#17253f] pb-2">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wide">
            {country ? 'COUNTRY INTELLIGENCE' : 'NODE TELEMETRY'}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {country ? renderCountry() : renderNode()}
    </div>
  );
};

export default CountryDetailPanel;