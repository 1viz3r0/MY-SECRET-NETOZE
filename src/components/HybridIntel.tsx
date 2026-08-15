import React, { useState, useEffect, useCallback } from 'react';
import { Radar, Radio, Server, Send, RefreshCw } from 'lucide-react';
import { fmtEpoch, sNo } from '../lib/format';
import { getConnectivityStatus, getDevices, refreshDevices, scanHostPorts, getPortScanResults } from '../services/tauri/intel';
import { getCaptureMetrics } from '../services/tauri/capture';
import type { DeviceEntry, PortScanEntry, ConnectivityStatus } from '../services/tauri/intel';
import type { CaptureMetrics } from '../services/tauri/capture';

export const HybridIntel: React.FC = () => {
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [scanResults, setScanResults] = useState<PortScanEntry[]>([]);
  const [connectivity, setConnectivity] = useState<ConnectivityStatus | null>(null);
  const [metrics, setMetrics] = useState<CaptureMetrics | null>(null);
  const [probeIp, setProbeIp] = useState<string>('127.0.0.1');
  const [probePorts, setProbePorts] = useState<string>('22,80,443,8080');
  const [probing, setProbing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, s, c, m] = await Promise.all([
        getDevices(),
        getPortScanResults(200),
        getConnectivityStatus(),
        getCaptureMetrics(),
      ]);
      setDevices(d);
      setScanResults(s);
      setConnectivity(c);
      setMetrics(m);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load hybrid engine state');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const runProbe = async () => {
    setError(null);
    setProbing(true);
    try {
      const ports = probePorts.split(',').map((s) => parseInt(s.trim(), 10)).filter(Number.isInteger);
      const results = await scanHostPorts(probeIp, ports);
      setScanResults(results);
      setProbeIp(probeIp);
    } catch (e: any) {
      setError(e?.message || 'Probe failed');
    } finally {
      setProbing(false);
    }
  };

  const refresh = async () => {
    try {
      setDevices(await refreshDevices());
    } catch (e: any) {
      setError(e?.message || 'Device refresh failed');
    }
  };

  const connected = connectivity?.state === 'ONLINE';
  const openPorts = scanResults.filter((p) => p.state === 'OPEN');

  return (
    <div className="space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white font-mono uppercase">Hybrid Network Intelligence Engine</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="flex items-center gap-1.5 text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-2.5 py-1 rounded-lg hover:bg-cyan-500/30 cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={refresh}
            className="flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-lg hover:bg-emerald-500/30 cursor-pointer">
            <Radio className="w-3.5 h-3.5" /> Rescan ARP
          </button>
        </div>
      </div>

      {error && <div className="bg-red-950/40 border border-red-500/50 text-red-400 text-xs p-3 rounded-lg">{error}</div>}

      {/* Status strip */}
      <div className="cyber-card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">Capture Status</div>
            <div className={`font-mono font-bold ${metrics?.status === 'RUNNING' ? 'text-emerald-400' : metrics?.status === 'ERROR' ? 'text-red-400' : 'text-amber-400'}`}>
              {metrics?.status === 'RUNNING' ? 'CAPTURING' : metrics?.status === 'ERROR' ? 'UNAVAILABLE' : 'READY'}
            </div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">Interface / IP</div>
            <div className="text-white font-mono">{metrics?.selected_interface || 'No interface selected'}</div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">Internet Path</div>
            <div className={connected ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
              {connectivity ? connectivity.state : 'UNKNOWN'}
            </div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">Devices Tracked</div>
            <div className="text-cyan-400 font-mono font-bold">{devices.length}</div>
          </div>
        </div>
      </div>

      {/* Active probe */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-[#142646] pb-2">
          <Send className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-white text-xs">Active Probing (TCP connect scan)</h3>
        </div>
        <div className="flex flex-wrap items-end gap-2.5 mb-2">
          <div>
            <div className="text-[10px] text-slate-400 mb-1">Target IP</div>
            <input value={probeIp} onChange={(e) => setProbeIp(e.target.value)}
              className="bg-black/60 border border-[#142646] rounded-lg px-2.5 py-1 text-xs font-mono text-white w-36" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 mb-1">Ports</div>
            <input value={probePorts} onChange={(e) => setProbePorts(e.target.value)}
              className="bg-black/60 border border-[#142646] rounded-lg px-2.5 py-1 text-xs font-mono text-white w-36" />
          </div>
          <button onClick={runProbe} disabled={probing}
            className="bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-50">
            {probing ? 'Scanning…' : 'Run TCP Scan'}
          </button>
        </div>
        {openPorts.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {openPorts.map((p) => (
              <div key={`${p.ip}:${p.port}`} className="bg-[#050b18] border border-emerald-500/50 p-2.5 rounded-lg">
                <div className="text-[10px] text-slate-400">Port {p.port} · {p.ip}</div>
                <div className="font-mono font-bold text-emerald-400">OPEN</div>
                <div className="text-[10px] text-slate-400 truncate">{p.service || ''}</div>
              </div>
            ))}
          </div>
        )}
        {openPorts.length === 0 && !probing && (
          <div className="text-slate-500 text-[11px]">No open ports recorded — run a scan against a reachable host.</div>
        )}
      </div>

      {/* Asset inventory */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-[#142646] pb-2">
          <Server className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-white text-xs">Asset / Topology Inventory (ARP + flow observation)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>IP</th>
                <th>MAC</th>
                <th>Vendor</th>
                <th>Hostname</th>
                <th>Status</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((a, idx) => (
                <tr key={a.ip}>
                  <td className="text-slate-500">{sNo(idx)}</td>
                  <td className="text-cyan-400 font-bold">{a.ip}{a.is_self ? ' (this host)' : ''}</td>
                  <td className="text-slate-300">{a.mac || '—'}</td>
                  <td className="text-slate-400">{a.vendor || 'Unknown'}</td>
                  <td className="text-slate-400">{a.hostname || '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${a.active ? 'bg-emerald-500/20 text-emerald-400 font-bold' : 'bg-slate-800 text-slate-400'}`}>
                      {a.active ? 'ACTIVE' : 'IDLE'}
                    </span>
                  </td>
                  <td className="text-slate-400 font-mono text-[10px]">{fmtEpoch(a.last_seen)}</td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-slate-500 text-center py-4">
                    No devices discovered yet — ARP table is empty or capture has not observed traffic.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
