import React, { useState } from 'react';
import { Network, Activity, ArrowRight, Server, Globe, Laptop } from 'lucide-react';
import { fmtEpoch } from '../lib/format';

interface AttackGraphProps {
  graphData: {
    nodes: Array<{ id: string; label: string; type: string; max_severity: string }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      protocol: string;
      count: number;
      max_severity: string;
      threat_score: number;
    }>;
  };
  flows: any[];
}

export const AttackGraph: React.FC<AttackGraphProps> = ({ graphData, flows }) => {
  const [selectedHost, setSelectedHost] = useState<string | null>(null);

  const getSeverityColor = (sev: string) => {
    const map: Record<string, string> = {
      CRITICAL: 'text-red-400 border-red-500 bg-red-500/10',
      HIGH: 'text-orange-400 border-orange-500 bg-orange-500/10',
      MEDIUM: 'text-amber-400 border-amber-500 bg-amber-500/10',
      LOW: 'text-yellow-300 border-yellow-500 bg-yellow-500/10',
      INFO: 'text-blue-300 border-blue-500 bg-blue-500/10',
    };
    return map[sev] || 'text-slate-400 border-slate-500 bg-slate-800';
  };

  const getHostIcon = (ip: string) => {
    if (ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return <Laptop className="w-4 h-4 text-cyan-400" />;
    }
    if (ip === '8.8.8.8' || ip === '1.1.1.1') {
      return <Globe className="w-4 h-4 text-sky-400" />;
    }
    return <Server className="w-4 h-4 text-purple-400" />;
  };

  const timelineFlows = selectedHost
    ? flows.filter((f) => f.src_ip === selectedHost || f.dst_ip === selectedHost)
    : flows;

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* Topology / Blast Radius Graph */}
      <div className="cyber-card p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#142646]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-mono uppercase">
              HOST-TO-HOST RELATIONSHIPS &amp; BLAST RADIUS (ATTACK GRAPH)
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Nodes: <strong className="text-white">{graphData.nodes?.length || 0}</strong> | Edges:{' '}
            <strong className="text-white">{graphData.edges?.length || 0}</strong>
          </span>
        </div>

        {/* Nodes Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 mb-4">
          {(graphData.nodes || []).map((n) => {
            const isSelected = selectedHost === n.id;
            const cls = getSeverityColor(n.max_severity);
            return (
              <button
                key={n.id}
                onClick={() => setSelectedHost(isSelected ? null : n.id)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${cls} ${
                  isSelected ? 'ring-2 ring-cyan-400 scale-105' : 'hover:scale-102'
                }`}
              >
                {getHostIcon(n.id)}
                <span className="text-[11px] font-mono font-bold truncate max-w-full">{n.label}</span>
                <span className="text-[9px] font-mono opacity-80">{n.max_severity}</span>
              </button>
            );
          })}
        </div>

        {/* Edges / Connections Table */}
        <div className="space-y-2">
          <h3 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            Active Connection Edges &amp; Blast Paths
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {(graphData.edges || []).map((edge) => (
              <div
                key={edge.id}
                className="bg-[#050b18] border border-[#142646] rounded-lg p-2.5 flex items-center justify-between font-mono text-xs"
              >
                <div className="flex items-center gap-1 text-slate-300">
                  <span className="font-semibold text-cyan-400">{edge.source}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="font-semibold text-slate-200">{edge.target}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-[#142646] text-[10px]">
                    {edge.protocol}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${getSeverityColor(edge.max_severity)}`}>
                    {edge.max_severity} ({edge.threat_score})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Kill-Chain Timeline */}
      <div className="cyber-card p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#142646]">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-mono uppercase">
              ATTACK TIMELINE &amp; KILL-CHAIN VIEW{' '}
              {selectedHost && (
                <span className="text-cyan-400">(Filtered for host {selectedHost})</span>
              )}
            </h2>
          </div>
          {selectedHost && (
            <button
              onClick={() => setSelectedHost(null)}
              className="text-xs text-cyan-400 hover:underline font-mono cursor-pointer"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="space-y-2">
          {timelineFlows.map((f, idx) => (
            <div
              key={f.flow_id}
              className="bg-[#050b18] border border-[#142646] rounded-lg p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs font-mono"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-800 border border-[#142646] flex items-center justify-center font-bold text-[10px] text-slate-400">
                  {idx + 1}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                    <span>{f.src_ip}</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span>{f.dst_ip}:{f.dst_port}</span>
                    <span className="bg-cyan-500/20 text-cyan-400 px-1.5 py-0.2 rounded text-[10px]">
                      {f.protocol}
                    </span>
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    TCP State: {f.tcp_state} | JA4: {f.ja4 || 'N/A'} | {fmtEpoch(f.ts_start)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <span className={`px-2.5 py-0.5 rounded font-bold text-[10px] border ${getSeverityColor(f.severity)}`}>
                  {f.severity} ({f.threat_score})
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
