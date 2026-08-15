import React, { useEffect, useRef, useState } from 'react';
import { Globe3D } from './Globe3D';
import type { LocationNode, CountryGeo } from './Globe3D';
import { CountryDetailPanel, type CountryStats } from './CountryDetailPanel';
import { CountryMapView } from './CountryMapView';
import { SearchModal } from './SearchModal';
import { loadCountryVector, loadAdmin1, type CountryVector, type GeoRegion } from '../lib/geoMap';
import type { GeoSearchResult } from '../lib/geoSearch';
import { ArrowRight, RefreshCw, ShieldAlert } from 'lucide-react';
import type { TabType } from './Sidebar';
import { getActiveFlows, getFlowSummary, type FlowRecord, type FlowSummaryStats } from '../services/tauri/flows';
import { getCaptureMetrics, type CaptureMetrics } from '../services/tauri/capture';
import { getDetectionSummary, getDetections, type DetectionSummary, type DetectionFinding } from '../services/tauri/detections';
import {
  getConnectivityStatus,
  getGeoipForActiveFlows,
  getGeoipLookup,
  getPublicIp,
  getThreatIntelStatus,
  evaluateFlowsForThreats,
  getThreatMatches,
  getDevices,
  subscribeToConnectivity,
  subscribeToThreatIntelStatus,
  type ConnectivityStatus,
  type GeoIpEntry,
  type ThreatIntelStatus,
  type ThreatMatchEntry,
  type DeviceEntry
} from '../services/tauri/intel';

interface GlobalIntelViewProps {
  selectedNode: LocationNode | null;
  setSelectedNode: (node: LocationNode | null) => void;
  setActiveTab: (tab: TabType) => void;
  openSearchToken?: number;
}

interface FlowRow {
  time: string;
  src: string;
  dst: string;
  protocol: string;
  pkts: string;
  bytes: string;
  status: string;
  location: string;
  risk: string;
}

const STATUS_COLOR: Record<string, string> = {
  ONLINE: 'text-emerald-400 bg-emerald-950/70 border-emerald-800',
  DEGRADED: 'text-amber-400 bg-amber-950/70 border-amber-800',
  OFFLINE: 'text-rose-400 bg-rose-950/70 border-rose-800',
  CONNECTING: 'text-cyan-400 bg-cyan-950/70 border-cyan-800',
  STALE: 'text-slate-400 bg-slate-900/70 border-slate-700',
};

export const GlobalIntelView: React.FC<GlobalIntelViewProps> = ({
  selectedNode,
  setSelectedNode,
  setActiveTab,
  openSearchToken
}) => {
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(true);
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [summary, setSummary] = useState<FlowSummaryStats | null>(null);
  const [metrics, setMetrics] = useState<CaptureMetrics | null>(null);
  const [detSummary, setDetSummary] = useState<DetectionSummary | null>(null);
  const [detections, setDetections] = useState<DetectionFinding[]>([]);
  const [connectivity, setConnectivity] = useState<ConnectivityStatus | null>(null);
  const [threatStatus, setThreatStatus] = useState<ThreatIntelStatus | null>(null);
  const [geoip, setGeoip] = useState<GeoIpEntry[]>([]);
  const [threatMatches, setThreatMatches] = useState<ThreatMatchEntry[]>([]);
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState<boolean>(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryGeo | null>(null);
  const [telemetry, setTelemetry] = useState<{ rx: number; tx: number; rtt: number }>({ rx: 0, tx: 0, rtt: 0 });
  const rxSamplesRef = useRef<number[]>([]);
  const txSamplesRef = useRef<number[]>([]);
  const [rxSamples, setRxSamples] = useState<number[]>([]);
  const [txSamples, setTxSamples] = useState<number[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const [hubInfo, setHubInfo] = useState<GeoIpEntry | null>(null);

  const [selectedRegion, setSelectedRegion] = useState<GeoRegion | null>(null);
  const [countryVector, setCountryVector] = useState<CountryVector | null>(null);
  const [regions, setRegions] = useState<GeoRegion[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ type: 'region' | 'city'; code?: string; lat: number; lng: number } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Navbar search button opens the geo search modal.
  useEffect(() => {
    if (openSearchToken && openSearchToken > 0) setIsSearchOpen(true);
  }, [openSearchToken]);

  // Load world-countries metadata + Natural Earth admin1 regions for the selected country.
  useEffect(() => {
    let cancelled = false;
    if (!selectedCountry) {
      setCountryVector(null);
      setRegions([]);
      setSelectedRegion(null);
      setFocusRequest(null);
      return;
    }
    setCountryVector(null);
    setRegions([]);
    setSelectedRegion(null);
    (async () => {
      try {
        const [v, rs] = await Promise.all([loadCountryVector(selectedCountry.iso), loadAdmin1(selectedCountry.iso)]);
        if (cancelled) return;
        setCountryVector(v);
        setRegions(rs);
      } catch {
        if (cancelled) return;
        setCountryVector(null);
        setRegions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCountry]);

  // Global hotkeys: Ctrl/Cmd+K opens geo search; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen]);

  const handleSelectGeo = (result: GeoSearchResult) => {
    const fromSearch = (iso2: string, name: string, lat: number, lng: number, fl?: string | null) => {
      const c: CountryGeo = { name, iso: iso2, lat, lng, fl: fl ?? undefined };
      setSelectedNode(null);
      setSelectedCountry(c);
      setIsDetailPanelOpen(true);
    };
    if (result.kind === 'country') {
      fromSearch(result.iso2, result.name, result.lat, result.lng, result.flag);
    } else if (result.kind === 'region') {
      fromSearch(result.country, result.name, result.lat, result.lng);
      setFocusRequest({ type: 'region', code: result.code ?? undefined, lat: result.lat, lng: result.lng });
    } else {
      fromSearch(result.country, result.name, result.lat, result.lng);
      setFocusRequest({ type: 'city', lat: result.lat, lng: result.lng });
    }
  };

  // Resolve THIS NET0ZE instance's own public position (real GeoIP of the machine's public IP).
  // Used to draw the self node + hub arcs. Falls back silently (no hub) when offline.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const resolveHub = async () => {
      try {
        const ip = await getPublicIp();
        if (!ip || cancelled) {
          if (!ip && !cancelled && ++attempts < 5) setTimeout(resolveHub, 30000);
          return;
        }
        const info = await getGeoipLookup(ip);
        if (cancelled) return;
        if (info && info.latitude != null && info.longitude != null) {
          setHubInfo(info);
        } else if (++attempts < 5) {
          setTimeout(resolveHub, 30000);
        }
      } catch {
        if (!cancelled && ++attempts < 5) setTimeout(resolveHub, 30000);
      }
    };
    resolveHub();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCore = async () => {
    const [f, s, m, ds, det, conn, devs] = await Promise.all([
      getActiveFlows(50),
      getFlowSummary(),
      getCaptureMetrics(),
      getDetectionSummary(),
      getDetections(20),
      getConnectivityStatus(),
      getDevices(),
    ]);
    if (!mountedRef.current) return; // race guard: view unmounted during refresh
    setFlows(f);
    setSummary(s);
    setMetrics(m);
    setDetSummary(ds);
    setDetections(det);
    setDevices(devs);
    if (conn) setConnectivity(conn);
  };

  const refreshIntel = async () => {
    const [geo, matches, tStatus] = await Promise.all([
      getGeoipForActiveFlows(),
      evaluateFlowsForThreats(),
      getThreatIntelStatus(),
    ]);
    if (!mountedRef.current) return;
    if (geo.length > 0) setGeoip(geo);
    if (matches.length > 0) setThreatMatches(matches);
    if (tStatus) setThreatStatus(tStatus);
    const persisted = await getThreatMatches(50);
    if (!mountedRef.current) return;
    if (persisted.length > 0) setThreatMatches(persisted);
  };

  useEffect(() => {
    refreshCore();
    refreshIntel();

    const coreInterval = setInterval(refreshCore, 3000);
    const intelInterval = setInterval(refreshIntel, 15000);
    const deviceInterval = setInterval(async () => {
      const d = await getDevices();
      setDevices(d);
    }, 30000);

    let unsubTelemetry: (() => void) | null = null;
    let unsubConn: (() => void) | null = null;
    let unsubThreat: (() => void) | null = null;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unsubTelemetry = await listen<{ rx_kbps: number; tx_kbps: number; rtt_avg_ms: number }>(
        'system-telemetry',
        (e) => {
          const { rx_kbps, tx_kbps, rtt_avg_ms } = e.payload;
          setTelemetry({ rx: rx_kbps, tx: tx_kbps, rtt: rtt_avg_ms });
          const rxS = [...rxSamplesRef.current.slice(-19), rx_kbps];
          const txS = [...txSamplesRef.current.slice(-19), tx_kbps];
          rxSamplesRef.current = rxS;
          txSamplesRef.current = txS;
          setRxSamples(rxS);
          setTxSamples(txS);
        }
      );
      unsubConn = await subscribeToConnectivity((s) => setConnectivity(s));
      unsubThreat = await subscribeToThreatIntelStatus((s) => setThreatStatus(s));
    })();

    return () => {
      clearInterval(coreInterval);
      clearInterval(intelInterval);
      clearInterval(deviceInterval);
      unsubTelemetry?.();
      unsubConn?.();
      unsubThreat?.();
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshCore(), refreshIntel()]);
    setIsRefreshing(false);
  };

  // Build real globe nodes from GeoIP + threat matches + flow aggregates
  const geoByIp = new Map(geoip.map((g) => [g.ip, g]));
  const threatByIp = new Map(threatMatches.map((t) => [t.ip, t]));
  const flowAgg: Record<string, { pkts: number; flows: number; rtt: number }> = {};
  for (const f of flows) {
    const key = f.dst_ip;
    const agg = (flowAgg[key] = flowAgg[key] || { pkts: 0, flows: 0, rtt: 0 });
    agg.pkts += f.packet_count;
    agg.flows += 1;
    if (f.rtt_ms > 0) agg.rtt = f.rtt_ms;
  }

  const globeNodes: LocationNode[] = geoip
    .filter((g) => g.latitude !== null && g.longitude !== null)
    .map((g) => {
      const threat = threatByIp.get(g.ip);
      const agg = flowAgg[g.ip];
      const status: LocationNode['status'] = threat
        ? threat.severity === 'HIGH'
          ? 'critical'
          : 'high'
        : 'low';
      return {
        id: g.ip,
        name: `${g.city}, ${g.country}`,
        country: g.country,
        lat: g.latitude ?? 0,
        lng: g.longitude ?? 0,
        pkts: agg ? `${agg.pkts} pkt` : '0 pkt',
        rtt: agg && agg.rtt > 0 ? `RTT ${agg.rtt}ms` : 'RTT n/a',
        status,
        color: status === 'critical' ? '#ff3355' : status === 'high' ? '#ff9900' : '#00e676',
        activeFlowsCount: agg?.flows ?? 0,
        threatLevel: threat ? threat.severity : 'STABLE',
        ip: g.ip,
      };
    });

  // This NET0ZE instance itself (real public IP via GeoIP) — first entry, distinct cyan
  const selfNode: LocationNode | null =
    hubInfo && hubInfo.latitude != null && hubInfo.longitude != null
      ? {
          id: hubInfo.ip,
          name: `${hubInfo.city ?? 'Local'}, ${hubInfo.country ?? 'THIS NET0ZE NODE'} (SELF)`,
          country: hubInfo.country ?? '',
          lat: hubInfo.latitude,
          lng: hubInfo.longitude,
          pkts: metrics && metrics.packets_captured > 0 ? `${metrics.packets_captured.toLocaleString()} pkt` : '0 pkt',
          rtt: connectivity?.latency_ms != null ? `RTT ${connectivity.latency_ms}ms` : 'RTT n/a',
          status: 'low',
          color: '#00d4ff',
          activeFlowsCount: summary?.active_flows_count ?? 0,
          threatLevel: 'SELF',
          ip: hubInfo.ip,
        }
      : null;
  if (selfNode) globeNodes.unshift(selfNode);

  // Real per-country aggregation from observed flows + GeoIP + threat matches
  const countryStatsFor = (iso: string): CountryStats | null => {
    const ips = new Set<string>();
    const sources = new Set<string>();
    let resolvedAt = 0;
    for (const g of geoip) {
      if (g.country_code !== iso) continue;
      ips.add(g.ip);
      sources.add(g.source);
      if (g.resolved_at > resolvedAt) resolvedAt = g.resolved_at;
    }
    if (ips.size === 0) return null;
    let flowsN = 0;
    let packets = 0;
    let bytes = 0;
    let rttSum = 0;
    let rttN = 0;
    const remoteIps = new Set<string>();
    for (const f of flows) {
      if (!ips.has(f.dst_ip)) continue;
      flowsN += 1;
      packets += f.packet_count;
      bytes += f.total_bytes;
      if (f.rtt_ms > 0) {
        rttSum += f.rtt_ms;
        rttN += 1;
      }
      remoteIps.add(f.dst_ip);
    }
    const sevs = threatMatches.filter((t) => ips.has(t.ip)).map((t) => t.severity);
    const rank: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
    const topSev = sevs.length ? [...sevs].sort((a, b) => (rank[b] ?? 0) - (rank[a] ?? 0))[0] : null;
    return {
      flows: flowsN,
      packets,
      bytes,
      rttMs: rttN > 0 ? rttSum / rttN : null,
      threatMatches: sevs.length,
      topSeverity: topSev,
      remoteIps: [...remoteIps].slice(0, 5),
      sources: [...sources],
      resolvedAt: resolvedAt || null,
      updatedAt: Date.now(),
    };
  };

  const displayedFlows: FlowRow[] = flows.slice(0, 50).map((f) => {
    const ts = new Date(f.ts_end);
    const location = geoByIp.get(f.dst_ip);
    const threat = threatByIp.get(f.dst_ip);
    return {
      time: ts.toLocaleTimeString(),
      src: `${f.src_ip}:${f.src_port}`,
      dst: `${f.dst_ip}:${f.dst_port}`,
      protocol: f.protocol,
      pkts: f.packet_count.toString(),
      bytes: formatBytes(f.total_bytes),
      status: f.tcp_state,
      location: location ? `${location.city}, ${location.country}` : 'Unresolved',
      risk: threat ? threat.severity : 'LOW',
    };
  });

  const threatTypeCounts = (() => {
    const counts = new Map<string, number>();
    for (const d of detections) {
      counts.set(d.category, (counts.get(d.category) || 0) + 1);
    }
    const colors = ['#ff3355', '#ff9900', '#0088ff', '#00e676'];
    return [...counts.entries()].slice(0, 4).map(([name, count], idx) => ({
      name,
      count,
      color: colors[idx % colors.length],
    }));
  })();

  const sev = detSummary ?? {
    total_findings_count: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    info_count: 0,
    active_count: 0,
    resolved_count: 0,
  };

  const connState = connectivity?.state || 'CONNECTING';
  const captureRunning = metrics?.status === 'RUNNING';
  const avgRtt = telemetry.rtt > 0 ? telemetry.rtt : summary?.avg_rtt_ms ?? 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#060913] text-slate-200">
      {/* Upper Layout: Left Column | Center 3D Globe | Right Column */}
      <div className="grid grid-cols-12 gap-3 p-3 flex-1 min-h-[560px]">
        {/* Left Metrics Column */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          {/* Capture Engine Card */}
          <div className="cyber-card p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                CAPTURE ENGINE
              </span>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <div className="flex items-baseline justify-between">
              <span className={`text-xl font-extrabold font-mono ${captureRunning ? 'text-emerald-400' : 'text-slate-400'}`}>
                {metrics?.status || 'STOPPED'}
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold border rounded ${STATUS_COLOR[connState] || STATUS_COLOR.STALE}`}>
                {connState}
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate">
              {metrics?.selected_interface || 'No interface selected'}
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-[#17243c] text-center">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase">Packets</span>
                <span className="text-sm font-bold font-mono text-cyan-400">{metrics?.packets_captured ?? 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase">Dropped</span>
                <span className="text-sm font-bold font-mono text-amber-400">{metrics?.dropped_packets ?? 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase">Flows</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{summary?.active_flows_count ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Active Systems (real discovered devices) */}
          <div className="cyber-card p-3.5 flex flex-col gap-2">
            <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
              DISCOVERED DEVICES
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-white">
                <span className="text-emerald-400">{devices.length}</span>
                <span className="text-slate-500 text-base"> on LAN</span>
              </span>
            </div>
            <div className="w-full bg-[#101b30] h-2 rounded-full overflow-hidden border border-[#1b2b48]">
              <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(100, devices.length * 4)}%` }} />
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {devices.length > 0
                ? `${devices.filter((d) => d.active).length} active • ${devices.filter((d) => !d.is_self).length} remote`
                : 'Run capture to discover peers (ARP + flow observation)'}
            </div>
          </div>

          {/* RTT Gap */}
          <div className="cyber-card p-3.5 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                AVG TCP RTT
              </span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                {avgRtt > 0 ? `${avgRtt.toFixed(1)}ms` : 'n/a'}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="px-2.5 py-1 text-xs font-semibold text-cyan-400 bg-cyan-950/70 border border-cyan-800/60 rounded">
                {connectivity?.latency_ms ? `${connectivity.latency_ms}ms to internet` : 'offline'}
              </span>
              <span className="text-[9px] font-mono text-slate-500 max-w-[130px] truncate">
                {connectivity?.source || ''}
              </span>
            </div>
          </div>

          {/* Telemetry Ingress / Egress (real adapter rates) */}
          <div className="cyber-card p-3.5 flex flex-col gap-3 flex-1">
            <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
              TELEMETRY INGRESS / EGRESS
            </span>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Ingress</span>
                <span className="text-cyan-400 font-bold">{formatKbps(telemetry.rx)}</span>
              </div>
              <div className="h-5 w-full flex items-end gap-1">
                {rxSamples.length > 0 ? (
                  rxSamples.map((val, idx) => (
                    <div key={idx} className="flex-1 bg-cyan-500/80 rounded-t-sm" style={{ height: `${Math.min(100, (val / Math.max(64, ...rxSamples)) * 100)}%` }} />
                  ))
                ) : (
                  <div className="w-full text-[10px] font-mono text-slate-600">waiting for telemetry samples…</div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Egress</span>
                <span className="text-emerald-400 font-bold">{formatKbps(telemetry.tx)}</span>
              </div>
              <div className="h-5 w-full flex items-end gap-1">
                {txSamples.length > 0 ? (
                  txSamples.map((val, idx) => (
                    <div key={idx} className="flex-1 bg-emerald-500/80 rounded-t-sm" style={{ height: `${Math.min(100, (val / Math.max(64, ...txSamples)) * 100)}%` }} />
                  ))
                ) : (
                  <div className="w-full text-[10px] font-mono text-slate-600">waiting for telemetry samples…</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Center 3D Globe Container */}
        <div className="col-span-12 lg:col-span-6 cyber-card relative flex flex-col overflow-hidden min-h-[460px]">
          <div className="p-3 border-b border-[#17243c] flex items-center justify-between z-10 bg-[#081022]/80 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono font-bold text-white tracking-wide">
                GLOBAL THREAT TELEMETRY GLOBE
              </span>
            </div>

            <button
              onClick={() => setIsAutoRotate(!isAutoRotate)}
              className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-all cursor-pointer ${
                isAutoRotate ? 'bg-cyan-950/80 text-cyan-400 border-cyan-800' : 'bg-[#101b30] text-slate-400 border-[#1d2f4d]'
              }`}
            >
              {isAutoRotate ? 'AUTO-ROTATE: ON' : 'AUTO-ROTATE: OFF'}
            </button>
          </div>

          {/* 3D Globe Viewport */}
          <div className="flex-1 w-full h-full relative">
            <Globe3D
              nodes={globeNodes}
              selectedNode={selectedNode}
              selectedCountry={selectedCountry}
              onSelectNode={(node) => {
                setSelectedCountry(null);
                setSelectedNode(node);
                setIsDetailPanelOpen(true);
              }}
              onSelectCountry={(country) => {
                setSelectedNode(null);
                setSelectedCountry(country);
                setIsDetailPanelOpen(true);
              }}
              isAutoRotate={isAutoRotate}
              hub={hubInfo && hubInfo.latitude != null && hubInfo.longitude != null ? { lat: hubInfo.latitude, lng: hubInfo.longitude } : null}
            />

            {globeNodes.length === 0 && !selectedCountry && (
              <div className="absolute inset-x-0 top-16 z-10 flex justify-center pointer-events-none">
                <div className="bg-[#040a18]/80 backdrop-blur px-4 py-2 rounded border border-cyan-900/60 text-[11px] font-mono text-cyan-300">
                  No GeoIP nodes yet — start packet capture to plot live remote endpoints
                </div>
              </div>
            )}

            {/* Vector country map overlay (drill-down from the globe) */}
            {selectedCountry && (
              <CountryMapView
                country={{ iso2: selectedCountry.iso, name: selectedCountry.name, flag: selectedCountry.fl ?? null }}
                regions={regions}
                selectedRegion={selectedRegion}
                onSelectRegion={(r) => setSelectedRegion(r)}
                onTogglePanel={() => setIsDetailPanelOpen((open) => !open)}
                onBackToWorld={() => {
                  setSelectedCountry(null);
                  setSelectedRegion(null);
                  setFocusRequest(null);
                  setIsDetailPanelOpen(false);
                }}
                focusRequest={focusRequest}
              />
            )}

            {/* Country Detail Overlay Panel */}
            {isDetailPanelOpen && (selectedNode || selectedCountry) && (
              <CountryDetailPanel
                node={selectedNode}
                country={selectedCountry}
                vector={countryVector}
                regions={regions}
                selectedRegion={selectedRegion}
                onSelectRegion={(r) => setSelectedRegion(r)}
                connectivity={connectivity}
                stats={selectedCountry ? countryStatsFor(selectedCountry.iso) : null}
                onClose={() => setIsDetailPanelOpen(false)}
                topOffset={selectedCountry ? '3.4rem' : '0.75rem'}
              />
            )}

            {/* Geo search modal (Ctrl/Cmd+K) */}
            <SearchModal
              isOpen={isSearchOpen}
              onClose={() => setIsSearchOpen(false)}
              onSelectGeo={handleSelectGeo}
            />
          </div>
        </div>

        {/* Right Column: Live Threat Overview */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          <div className="cyber-card p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                LIVE THREAT OVERVIEW
              </span>
              <span className="text-[10px] font-mono text-slate-400 bg-[#0d172a] px-2 py-0.5 rounded border border-[#1b2b48]">
                DETECTION ENGINE
              </span>
            </div>

            <div className="flex items-center justify-around py-1">
              <div className="relative w-22 h-22 rounded-full border-8 border-rose-500/80 flex items-center justify-center border-t-amber-400 border-r-blue-500">
                <div className="flex flex-col items-center">
                  <span className="text-2xl font-extrabold text-white font-mono leading-none">{sev.total_findings_count}</span>
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5">Total Alerts</span>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-slate-400">Critical</span>
                  <span className="text-white font-bold ml-auto">{sev.critical_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-slate-400">High</span>
                  <span className="text-white font-bold ml-auto">{sev.high_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-slate-400">Medium</span>
                  <span className="text-white font-bold ml-auto">{sev.medium_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-slate-400">Low</span>
                  <span className="text-white font-bold ml-auto">{sev.low_count}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="cyber-card p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                THREAT INTEL FEEDS
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold border rounded ${
                threatStatus?.feed_state === 'LOADED' ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : threatStatus?.feed_state === 'ERROR' ? 'bg-rose-950 text-rose-400 border-rose-800'
                : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}>
                {threatStatus?.feed_state || 'EMPTY'}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {threatStatus?.ioc_count ?? 0} indicators from {threatStatus?.sources.join(', ') || 'no feeds'} •{' '}
              {threatStatus?.match_count ?? 0} observed matches
            </div>
            <div className="flex flex-col gap-1.5 text-xs font-mono">
              {threatTypeCounts.length > 0 ? (
                threatTypeCounts.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-slate-200 font-bold">{item.count}</span>
                  </div>
                ))
              ) : (
                <span className="text-[10px] text-slate-500">No detections yet — rules evaluate live capture flows</span>
              )}
            </div>
          </div>

          {/* Real-time Alert Feed */}
          <div className="cyber-card p-3.5 flex flex-col gap-2 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
                REAL-TIME ALERT FEED
              </span>
              <button onClick={() => setActiveTab('scenario_labs')} className="text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer">
                View All
              </button>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto max-h-48 pr-1">
              {detections.length > 0 ? (
                detections.slice(0, 8).map((alert) => (
                  <div key={alert.finding_id} className="flex items-center justify-between p-2 rounded bg-[#091122] border border-[#162540] text-xs font-mono">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      <span className="text-slate-200 font-semibold">{alert.title}</span>
                      <span className="text-[10px] text-cyan-400/90">{alert.source_ip} → {alert.destination_ip}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold border rounded ${
                      alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
                        ? 'text-rose-400 bg-rose-950/60 border-rose-800'
                        : alert.severity === 'MEDIUM'
                        ? 'text-amber-400 bg-amber-950/60 border-amber-800'
                        : 'text-blue-400 bg-blue-950/60 border-blue-800'
                    }`}>
                      {alert.severity}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-500">
                  <ShieldAlert className="w-6 h-6 opacity-40" />
                  <span className="text-[10px] font-mono">No alerts — all clear (so far)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Live Connections Table */}
      <div className="p-3 pt-0">
        <div className="cyber-card p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-[#17243c] pb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-200">LIVE GLOBAL CONNECTIONS</span>
              <span className="text-xs font-mono text-slate-400">• {flows.length} Active Flows</span>
            </div>
            <button onClick={() => setActiveTab('conversations')} className="flex items-center gap-1 text-xs font-mono text-cyan-400 hover:underline">
              View All Flows <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left cyber-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Protocol</th>
                  <th>Packets</th>
                  <th>Bytes</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {displayedFlows.length > 0 ? (
                  displayedFlows.map((row, idx) => (
                    <tr key={idx} className="cursor-pointer">
                      <td className="text-slate-400">{row.time}</td>
                      <td className="text-cyan-400">{row.src}</td>
                      <td className="text-slate-200">{row.dst}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800">
                          {row.protocol}
                        </span>
                      </td>
                      <td className="text-slate-300">{row.pkts}</td>
                      <td className="text-slate-300">{row.bytes}</td>
                      <td className="text-emerald-400 font-bold text-[10px]">{row.status}</td>
                      <td className="text-slate-200 font-semibold">{row.location}</td>
                      <td>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          row.risk === 'HIGH'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : row.risk === 'MEDIUM'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {row.risk}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-slate-500 text-xs font-mono">
                      No active flows — start packet capture from the Capture Console to populate live telemetry
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatKbps(kbps: number): string {
  if (kbps >= 1024 * 1024) return `${(kbps / (1024 * 1024)).toFixed(2)} Gbps`;
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} Mbps`;
  return `${kbps.toFixed(1)} Kbps`;
}
