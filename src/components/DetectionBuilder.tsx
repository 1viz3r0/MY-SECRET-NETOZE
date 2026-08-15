import React, { useState, useEffect } from 'react';
import { Sliders, Play, RefreshCw, BookOpen } from 'lucide-react';
import { listRules, enableDisableRule } from '../services/tauri/detections';
import type { DetectionRule } from '../services/tauri/detections';

export const DetectionBuilder: React.FC = () => {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRules = async () => {
    setLoading(true);
    try {
      setRules(await listRules());
    } catch (e) {
      console.error('Failed to load rules:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const toggleRule = async (rule: DetectionRule) => {
    setToggling(rule.rule_id);
    setNotice(null);
    try {
      const ok = await enableDisableRule(rule.rule_id, !rule.enabled);
      setNotice(ok
        ? `Rule ${rule.rule_id} ${!rule.enabled ? 'enabled' : 'disabled'} — live evaluation updated.`
        : `Failed to toggle ${rule.rule_id}.`);
      loadRules();
    } catch (e: any) {
      setNotice(e?.message || 'Failed to toggle rule');
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-black text-slate-200 overflow-y-auto p-4 gap-4 font-mono text-xs">
      {/* Header */}
      <div className="cyber-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500 flex items-center justify-center text-cyan-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider">
              DETECTION RULE CATALOG (LIVE)
            </h2>
            <p className="text-xs text-slate-400 font-sans">
              Built-in detection rules evaluate live capture flows. Toggle rules on/off and watch detections update.
            </p>
          </div>
        </div>
        <button
          onClick={loadRules}
          disabled={loading}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold px-4 py-2 rounded-lg transition-all shadow-lg cursor-pointer"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span>Refresh Catalog</span>
        </button>
      </div>

      {notice && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 text-emerald-300 p-2.5 rounded-lg text-xs font-mono">
          {notice}
        </div>
      )}

      {/* Rule table */}
      <div className="cyber-card p-4 space-y-3">
        <div className="flex items-center gap-2 border-b border-[#142646] pb-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-white text-xs">Installed Detection Rules ({rules.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>Rule ID</th>
                <th>Name</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.rule_id}>
                  <td className="text-cyan-400 font-bold">{rule.rule_id}</td>
                  <td className="text-white font-semibold">{rule.name}</td>
                  <td className="text-slate-400">{rule.category}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      rule.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                      rule.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                      rule.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>
                      {rule.severity}
                    </span>
                  </td>
                  <td className="text-slate-300">{Math.round(rule.confidence * 100)}%</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rule.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                      {rule.enabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => toggleRule(rule)}
                      disabled={toggling === rule.rule_id}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-mono font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
                        rule.enabled
                          ? 'bg-slate-800 text-slate-300 border-[#142646] hover:border-red-500'
                          : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                      }`}
                    >
                      {toggling === rule.rule_id ? 'Working…' : rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="text-slate-500 text-center py-4">
                    No detection rules found in the local catalog.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-[#050b18] border border-[#142646] rounded-lg p-3">
          <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            Custom rule authoring against a replay corpus is not supported in the desktop build — rules here
            are the built-in catalog applied to live capture flows. Rule source: <code className="text-cyan-300">detection_rules</code> (SQLite).
          </span>
        </div>
      </div>
    </div>
  );
};
