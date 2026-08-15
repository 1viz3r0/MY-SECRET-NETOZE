import React, { useState, useEffect } from 'react';
import { Activity, Server, Radio, Globe, RefreshCw, Cpu, ShieldCheck } from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { getDetailedSystemInfo } from '../services/tauri/system';
import type { DetailedSystemInfo } from '../services/tauri/system';
import { getDetailedNetworkInterfaces, getActiveTcpConnections } from '../services/tauri/network';
import type { DetailedAdapterInfo, TcpConnectionEntry } from '../services/tauri/network';
import { getWindowsEvents, subscribeToTelemetry } from '../services/tauri/events';
import type { WindowsEventEntry, TelemetryPayload } from '../services/tauri/events';
import { sNo } from '../lib/format';

interface SystemLogsProps {
  refreshMs?: number;
}

export const SystemLogs: React.FC<SystemLogsProps> = ({ refreshMs = 3000 }) => {
  const [sysInfo, setSysInfo] = useState<DetailedSystemInfo | null>(null);
  const [adapters, setAdapters] = useState<DetailedAdapterInfo[]>([]);
  const [tcpConns, setTcpConns] = useState<TcpConnectionEntry[]>([]);
  const [winEvents, setWinEvents] = useState<WindowsEventEntry[]>([]);
  const [wireTelemetry, setWireTelemetry] = useState<TelemetryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDesktop = isTauriEnvironment();

  const loadRealTelemetry = async () => {
    try {
      const [sys, ad, tcp, ev] = await Promise.all([
        getDetailedSystemInfo(),
        getDetailedNetworkInterfaces(),
        getActiveTcpConnections(),
        getWindowsEvents(20),
      ]);
      setSysInfo(sys);
      setAdapters(ad);
      setTcpConns(tcp);
      setWinEvents(ev);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Windows host system telemetry');
    }
  };

  useEffect(() => {
    loadRealTelemetry();
    const intervalId = setInterval(loadRealTelemetry, refreshMs);

    let unlisten: (() => void) | null = null;
    subscribeToTelemetry((payload) => {
      setWireTelemetry(payload);
    }).then((un) => {
      unlisten = un;
    });

    return () => {
      clearInterval(intervalId);
      if (unlisten) unlisten();
    };
  }, [refreshMs]);

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-bold text-white uppercase font-mono">
            System &amp; Network Telemetry — {isDesktop ? 'Native Windows Host' : 'Web Dev Fallback'}
          </h2>
        </div>
        <button
          onClick={loadRealTelemetry}
          className="flex items-center gap-1.5 text-xs bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-2.5 py-1 rounded-lg hover:bg-cyan-500/30 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Host Telemetry
        </button>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-500/50 text-red-400 text-xs p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Real Windows System Information & Hardware Specs */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#142646] pb-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" />
            <h3 className="font-bold text-white text-xs">Host System &amp; Architecture (Windows API)</h3>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
            sysInfo?.is_admin ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}>
            ADMINISTRATOR: {sysInfo?.is_admin ? 'ELEVATED' : 'STANDARD USER'}
          </span>
        </div>

        {sysInfo ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
              <div className="text-slate-400 text-[10px]">Hostname</div>
              <div className="text-white font-mono font-bold">{sysInfo.hostname}</div>
            </div>
            <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
              <div className="text-slate-400 text-[10px]">OS / Architecture</div>
              <div className="text-white font-mono">{sysInfo.os_name} {sysInfo.os_version} ({sysInfo.architecture})</div>
            </div>
            <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
              <div className="text-slate-400 text-[10px]">CPU Model ({sysInfo.cpu_core_count} Cores)</div>
              <div className="text-cyan-400 font-mono font-bold truncate">{sysInfo.cpu_model}</div>
            </div>
            <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
              <div className="text-slate-400 text-[10px]">RAM Usage ({sysInfo.ram_usage_percent.toFixed(1)}%)</div>
              <div className="text-emerald-400 font-mono font-bold">
                {(sysInfo.ram_available_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB Free / {(sysInfo.ram_total_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB Total
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">Querying Windows system APIs…</div>
        )}
      </div>

      {/* Real-time Wire Stream Ticker */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-[#142646] pb-2">
          <Radio className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-white text-xs">Real-Time Host Interface Throughput Ticker</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">RX Throughput</div>
            <div className="text-emerald-400 font-mono font-bold">
              {(wireTelemetry?.rx_kbps || 0).toFixed(2)} KB/s
            </div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">TX Throughput</div>
            <div className="text-cyan-400 font-mono font-bold">
              {(wireTelemetry?.tx_kbps || 0).toFixed(2)} KB/s
            </div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">Cumulative RX / TX Packets</div>
            <div className="text-white font-mono font-bold">
              {wireTelemetry?.rx_packets_delta || 0} / {wireTelemetry?.tx_packets_delta || 0}
            </div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] p-2.5 rounded-lg">
            <div className="text-slate-400 text-[10px]">Active Windows TCP Sockets</div>
            <div className="text-amber-400 font-mono font-bold">{tcpConns.length} Sockets</div>
          </div>
        </div>
      </div>

      {/* Active Windows TCP Connections (GetExtendedTcpTable + Process PID Mapper) */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#142646] pb-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-white text-xs">Active Windows TCP Connections (GetExtendedTcpTable + Process PID Mapper)</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Total Sockets: <strong className="text-white">{tcpConns.length}</strong>
          </span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Local Address</th>
                <th>Remote Address</th>
                <th>TCP State</th>
                <th>PID</th>
                <th>Process Name</th>
              </tr>
            </thead>
            <tbody>
              {tcpConns.map((s, i) => (
                <tr key={i}>
                  <td className="text-slate-500">{sNo(i)}</td>
                  <td className="text-cyan-400 font-bold">{s.local_ip}:{s.local_port}</td>
                  <td className="text-slate-200">{s.remote_ip}:{s.remote_port}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.tcp_state === 'ESTABLISHED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : s.tcp_state === 'LISTEN'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}>
                      {s.tcp_state}
                    </span>
                  </td>
                  <td className="text-slate-400 font-mono">{s.pid}</td>
                  <td className="text-white font-semibold">{s.process_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Windows Event Logs */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-[#142646] pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-white text-xs">Windows Host System &amp; Event Logs</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Channel: System / Security</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp</th>
                <th>Provider</th>
                <th>ID</th>
                <th>Level</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {winEvents.map((ev, i) => (
                <tr key={i}>
                  <td className="text-slate-500">{sNo(i)}</td>
                  <td className="text-slate-400 font-mono text-[10px]">{ev.timestamp.slice(0, 19)}</td>
                  <td className="text-cyan-400 font-semibold">{ev.provider}</td>
                  <td className="text-slate-300 font-mono">{ev.event_id}</td>
                  <td>
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.2 rounded text-[10px] font-bold">
                      {ev.level}
                    </span>
                  </td>
                  <td className="text-slate-200 font-sans text-xs">{ev.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
