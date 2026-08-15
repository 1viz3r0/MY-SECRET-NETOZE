import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, DatabaseZap, Lock } from 'lucide-react';
import { fmtEpoch, sNo } from '../lib/format';
import { getThreatMatches, getThreatIntelStatus, evaluateFlowsForThreats } from '../services/tauri/intel';
import { getAuditLog, type AuditLogEntry } from '../services/tauri/intel';
import type { ThreatMatchEntry, ThreatIntelStatus } from '../services/tauri/intel';

export const AuditAndIOCs: React.FC = () => {
  const [matches, setMatches] = useState<ThreatMatchEntry[]>([]);
  const [intelStatus, setIntelStatus] = useState<ThreatIntelStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [m, s, a] = await Promise.all([
        getThreatMatches(100),
        getThreatIntelStatus(),
        getAuditLog(100),
      ]);
      setMatches(m);
      setIntelStatus(s);
      setAuditLogs(a);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load threat intelligence state');
    }
  }, []);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, [loadData]);

  const runEvaluation = async () => {
    setEvaluating(true);
    setError(null);
    try {
      const newMatches = await evaluateFlowsForThreats();
      setMatches(newMatches.length > 0 ? newMatches : matches);
      loadData();
    } catch (e: any) {
      setError(e?.message || 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const sevClass: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/40',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    LOW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  };

  return (
    <div className="space-y-4 font-mono text-xs">
      {/* IOC Management Section */}
      <div className="cyber-card p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-[#142646] pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-mono uppercase">
              IOC MATCHES &amp; THREAT INTELLIGENCE (LIVE FEEDS)
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Matches: <strong className="text-white">{matches.length}</strong> | IOC Catalog:{' '}
            <strong className="text-white">{intelStatus?.ioc_count ?? 0}</strong>
          </span>
        </div>

        {/* Feed status strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
          <div className="bg-[#050b18] border border-[#142646] rounded-lg p-2.5">
            <div className="text-slate-400 text-[10px]">Feed State</div>
            <div className={`font-bold ${intelStatus?.feed_state === 'READY' ? 'text-emerald-400' : intelStatus?.feed_state === 'UPDATING' ? 'text-amber-400' : 'text-slate-300'}`}>
              {intelStatus?.feed_state ?? 'UNKNOWN'}
            </div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] rounded-lg p-2.5">
            <div className="text-slate-400 text-[10px]">Sources</div>
            <div className="text-white">{intelStatus?.sources?.join(', ') || '—'}</div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] rounded-lg p-2.5">
            <div className="text-slate-400 text-[10px]">Last Refresh</div>
            <div className="text-slate-300">{intelStatus?.last_fetched ? fmtEpoch(new Date(intelStatus.last_fetched).getTime() / 1000) : 'NEVER'}</div>
          </div>
          <div className="bg-[#050b18] border border-[#142646] rounded-lg p-2.5">
            <div className="text-slate-400 text-[10px]">Action</div>
            <button
              onClick={runEvaluation}
              disabled={evaluating}
              className="flex items-center gap-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-1 rounded transition-all cursor-pointer disabled:opacity-50"
            >
              <DatabaseZap className="w-3.5 h-3.5" />
              {evaluating ? 'Evaluating…' : 'Re-evaluate Flows'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-500/50 text-red-300 p-2.5 rounded-lg text-xs font-mono">
            {error}
          </div>
        )}

        <div className="text-[11px] text-slate-500">
          IOCs are pulled automatically from public threat feeds (SSLBL, Feodo) and matched against live
          capture flows. Manual IOC entry is not supported in the desktop build — feed data only.
        </div>

        {/* Match Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>IP</th>
                <th>Indicator</th>
                <th>Feed</th>
                <th>Severity</th>
                <th>Matched</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((item, idx) => (
                <tr key={`${item.ip}-${item.feed}-${idx}`}>
                  <td className="text-slate-500">{sNo(idx)}</td>
                  <td className="font-bold text-cyan-400">{item.ip}</td>
                  <td className="text-white font-semibold">{item.indicator_type}</td>
                  <td className="text-purple-300 font-bold">{item.feed}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${sevClass[item.severity] || 'bg-slate-500/20 text-slate-400 border-slate-500/40'}`}>
                      {item.severity}
                    </span>
                  </td>
                  <td className="text-slate-400 font-mono text-[10px]">{fmtEpoch(item.matched_at)}</td>
                </tr>
              ))}
              {matches.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-slate-500 text-center py-4">
                    No IOC matches yet — run capture and re-evaluate, or wait for the next flow evaluation.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Log Section */}
      <div className="cyber-card p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-[#142646] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white font-mono uppercase">
              TAMPER-EVIDENT CRYPTOGRAPHIC AUDIT LOG (SEC-02 / SHA-256 CHAINING)
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Log Entries: <strong className="text-white">{auditLogs.length}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ID / Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Cryptographic SHA-256 Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((item, idx) => (
                <tr key={item.id}>
                  <td className="text-slate-500">{sNo(idx)}</td>
                  <td className="text-slate-300 font-mono">{item.id} | {fmtEpoch(item.timestamp)}</td>
                  <td className="text-cyan-400 font-bold">{item.actor}</td>
                  <td className="text-white font-semibold">{item.action}</td>
                  <td className="text-slate-300">{item.resource}</td>
                  <td className="text-purple-300 font-mono text-[10px] truncate max-w-xs">{item.curr_hash}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-slate-500 text-center py-4">
                    Audit log is empty — entries are appended by backend integrity operations (currently none
                    pending in the desktop build).
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
