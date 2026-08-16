import React, { useState, useEffect } from 'react';
import { Filter, Search, Play, Square, Radio, ShieldAlert } from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import {
  inspectNpcapAvailability,
  getPcapInterfaces,
  startPacketCapture,
  stopPacketCapture,
  getCaptureMetrics,
  getCaptureEngineState,
  subscribeToCaptureStats,
  subscribeToCaptureStatus,
} from '../services/tauri/capture';
import type { NpcapInterface, CaptureMetrics, CaptureEngineDiagnostics } from '../services/tauri/capture';

interface FlowRow {
  flow_id: string;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  protocol: string;
  ip_version: number;
  client_bytes: number;
  server_bytes: number;
  tcp_state: string;
  ja4: string;
  threat_score: number;
  severity: string;
  confidence: number;
  ts_start: number;
  ts_end: number;
  duration_ms: number;
  score_breakdown?: any[];
  mitre_attack?: any[];
}

interface ConversationTableProps {
  flows: FlowRow[];
  selectedFlowId: string | null;
  onSelectFlow: (flowId: string) => void;
  onInspectField: (fieldName: string) => void;
}

export const ConversationTable: React.FC<ConversationTableProps> = ({
  flows,
  selectedFlowId,
  onSelectFlow,
  onInspectField,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Phase 3 Packet Capture Control States
  const [npcapStatus, setNpcapStatus] = useState<string>('UNAVAILABLE');
  const [npcapMsg, setNpcapMsg] = useState<string>('Checking Npcap driver availability...');
  const [pcapInterfaces, setPcapInterfaces] = useState<NpcapInterface[]>([]);
  const [selectedIface, setSelectedIface] = useState<string>('eth0');
  const [captureMetrics, setCaptureMetrics] = useState<CaptureMetrics | null>(null);
  const [captureState, setCaptureState] = useState<string>('STOPPED');

  const isDesktop = isTauriEnvironment();

  useEffect(() => {
    inspectNpcapAvailability().then(([status, msg]) => {
      setNpcapStatus(status);
      setNpcapMsg(msg);
    });

    getPcapInterfaces().then((ifaces) => {
      setPcapInterfaces(ifaces);
      if (ifaces.length > 0) {
        setSelectedIface(ifaces[0].id);
      }
    });

    getCaptureMetrics().then((m) => {
      setCaptureMetrics(m);
      setCaptureState(m.status);
    });

    let unlistenStats: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;

    subscribeToCaptureStats(setCaptureMetrics).then((un) => (unlistenStats = un));
    subscribeToCaptureStatus(setCaptureState).then((un) => (unlistenStatus = un));

    return () => {
      if (unlistenStats) unlistenStats();
      if (unlistenStatus) unlistenStatus();
    };
  }, []);

  const handleStartCapture = async () => {
    try {
      setCaptureState('STARTING');
      await startPacketCapture(selectedIface);
      
      // Verify capture engine is actually running
      const diagnostics = await getCaptureEngineState();
      if (diagnostics.status === 'RUNNING' && diagnostics.capture_handle_open) {
        setCaptureState('RUNNING');
      } else {
        setCaptureState('ERROR');
        alert(`Capture failed to start. Diagnostics: status=${diagnostics.status}, handle_open=${diagnostics.capture_handle_open}, interface=${diagnostics.selected_interface}`);
      }
    } catch (err: any) {
      setCaptureState('ERROR');
      alert(`Capture Error: ${err?.message || err}`);
    }
  };

  const handleStopCapture = async () => {
    try {
      setCaptureState('STOPPING');
      await stopPacketCapture();
      
      // Verify capture engine is actually stopped
      const diagnostics = await getCaptureEngineState();
      if (diagnostics.status === 'STOPPED') {
        setCaptureState('STOPPED');
      } else {
        setCaptureState('ERROR');
        alert(`Capture stop incomplete. Diagnostics: status=${diagnostics.status}, handle_open=${diagnostics.capture_handle_open}`);
      }
    } catch (err: any) {
      console.error('Failed to stop capture:', err);
    }
  };

  const filteredFlows = flows.filter((f) => {
    if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
    if (protocolFilter !== 'ALL' && f.protocol !== protocolFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const text = `${f.src_ip} ${f.dst_ip} ${f.protocol} ${f.flow_id} ${f.ja4 || ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const getSeverityBadge = (sev: string, score: number) => {
    const map: Record<string, string> = {
      CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/40',
      HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      LOW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
      INFO: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    };
    const cls = map[sev] || 'bg-slate-500/20 text-slate-400 border-slate-500/40';
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${cls}`}>
        {sev} ({score})
      </span>
    );
  };

  const getProtocolBadge = (proto: string) => {
    const map: Record<string, string> = {
      TLS: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      DNS: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      HTTP: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      SMB2: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      TCP: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      UDP: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    };
    const cls = map[proto] || 'bg-slate-500/20 text-slate-400 border-slate-500/40';
    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border ${cls}`}>
        {proto}
      </span>
    );
  };

  const summarizeFlow = (f: FlowRow) => {
    if (f.protocol === 'TLS' && f.ja4) {
      if (f.ja4.includes('8daaf6152771')) {
        return 'TLSv1.3 session with JA4 fingerprint matching C2 / Cobalt Strike tooling';
      }
      return 'TLS encrypted session to external destination';
    }
    if (f.protocol === 'DNS') {
      if (f.severity === 'HIGH') {
        return 'High-entropy DNS query carrying encoded subdomain tunneling payload';
      }
      return 'Standard domain resolution query';
    }
    return `Active ${f.protocol} conversation`;
  };

  return (
    <div className="cyber-card p-4 space-y-4 font-mono text-xs">
      {/* Header controls & Packet Capture Status */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-[#142646] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              VIRTUALIZED CONVERSATIONS &amp; REASSEMBLED FLOWS (ADR D-004)
            </h2>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              captureState === 'RUNNING'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                : captureState === 'STARTING'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              CAPTURE: {captureState}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Semantic elevation transforms raw frames into plain-language stories without decryption.
          </p>
        </div>

        {/* Start / Stop Capture Controls */}
        <div className="flex items-center gap-2">
          {npcapStatus === 'AVAILABLE' ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedIface}
                onChange={(e) => setSelectedIface(e.target.value)}
                disabled={captureState === 'RUNNING'}
                className="bg-[#081022] border border-[#142646] text-slate-200 rounded px-2.5 py-1 text-xs"
              >
                {pcapInterfaces.map((iface) => (
                  <option key={iface.id} value={iface.id}>
                    {iface.name} ({iface.mac_address})
                  </option>
                ))}
              </select>

              {captureState === 'RUNNING' ? (
                <button
                  onClick={handleStopCapture}
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1 rounded transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>STOP CAPTURE</span>
                </button>
              ) : (
                <button
                  onClick={handleStartCapture}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>START CAPTURE</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-500/40 text-amber-300 px-3 py-1 rounded text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>NPCAP UNAVAILABLE</span>
            </div>
          )}
        </div>
      </div>

      {/* Real Npcap Capture Metrics Banner */}
      {captureMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-[#050b18] border border-[#142646] p-2.5 rounded-lg text-xs font-mono">
          <div>
            <span className="text-slate-500 text-[10px] block">CAPTURED PACKETS</span>
            <span className="text-emerald-400 font-bold">{captureMetrics.packets_captured}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">CAPTURED BYTES</span>
            <span className="text-cyan-400 font-bold">{(captureMetrics.bytes_captured / 1024).toFixed(1)} KB</span>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">PACKETS / SEC</span>
            <span className="text-white font-bold">{captureMetrics.packets_per_sec.toFixed(1)} pps</span>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">DROPPED PACKETS</span>
            <span className="text-amber-400 font-bold">{captureMetrics.dropped_packets}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">DURATION</span>
            <span className="text-slate-300 font-bold">{captureMetrics.duration_secs}s</span>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-black/40 p-2.5 rounded-lg border border-[#142646]">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-[#081022] border border-[#142646] text-slate-200 rounded px-2 py-1"
          >
            <option value="ALL">ALL</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Protocol:</span>
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="bg-[#081022] border border-[#142646] text-slate-200 rounded px-2 py-1"
          >
            <option value="ALL">ALL</option>
            <option value="TLS">TLS</option>
            <option value="DNS">DNS</option>
            <option value="TCP">TCP</option>
            <option value="HTTP">HTTP</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-xs ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search IP, JA4, Flow ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#081022] border border-[#142646] text-slate-200 rounded px-2.5 py-1 text-xs"
          />
        </div>
      </div>

      {/* Conversations Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left cyber-table">
          <thead>
            <tr>
              <th>Flow ID</th>
              <th>Source Socket</th>
              <th>Destination Socket</th>
              <th>Proto</th>
              <th>TCP State</th>
              <th>JA4 Fingerprint</th>
              <th>Plain Language Summary</th>
              <th>Threat Score</th>
            </tr>
          </thead>
          <tbody>
            {filteredFlows.map((f) => {
              const isSelected = selectedFlowId === f.flow_id;
              return (
                <tr
                  key={f.flow_id}
                  onClick={() => onSelectFlow(f.flow_id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-cyan-950/60 border-l-2 border-cyan-400' : ''
                  }`}
                >
                  <td className="text-slate-400 font-mono">{f.flow_id}</td>
                  <td className="text-cyan-400 font-bold">
                    <span onClick={(e) => { e.stopPropagation(); onInspectField('src_ip'); }} className="hover:underline cursor-pointer">
                      {f.src_ip}:{f.src_port}
                    </span>
                  </td>
                  <td className="text-slate-200">
                    <span onClick={(e) => { e.stopPropagation(); onInspectField('dst_ip'); }} className="hover:underline cursor-pointer">
                      {f.dst_ip}:{f.dst_port}
                    </span>
                  </td>
                  <td>{getProtocolBadge(f.protocol)}</td>
                  <td>
                    <span onClick={(e) => { e.stopPropagation(); onInspectField('tcp_state'); }} className="text-slate-300 hover:underline cursor-pointer">
                      {f.tcp_state}
                    </span>
                  </td>
                  <td>
                    {f.ja4 ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); onInspectField('ja4'); }}
                        className="text-purple-300 hover:underline font-mono text-[10px] bg-purple-950/40 px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        {f.ja4.slice(0, 18)}...
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="text-slate-300 font-sans text-xs">{summarizeFlow(f)}</td>
                  <td>{getSeverityBadge(f.severity, f.threat_score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
