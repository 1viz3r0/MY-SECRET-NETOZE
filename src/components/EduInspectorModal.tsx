import React, { useState, useEffect } from 'react';
import { BookOpen, X, Terminal, Code, Info, ShieldAlert, ArrowRight } from 'lucide-react';
import { getFieldExplanation, type EduExplanation } from '../services/tauri/edu';

interface EduInspectorModalProps {
  selectedField: string | null;
  currentValue?: string;
  onClose: () => void;
}

export const EduInspectorModal: React.FC<EduInspectorModalProps> = ({
  selectedField,
  currentValue,
  onClose,
}) => {
  const [explanation, setExplanation] = useState<EduExplanation | null>(null);
  const [activeLevel, setActiveLevel] = useState<number>(1);
  const [fieldKey, setFieldKey] = useState<string>(selectedField || 'dst_port');
  const [fieldValue, setFieldValue] = useState<string>(currentValue ?? '');

  useEffect(() => {
    loadExplanation(fieldKey, fieldValue);
  }, [fieldKey, fieldValue]);

  const availableFields = [
    { id: 'src_ip', label: 'Source IP', val: '192.168.1.100' },
    { id: 'dst_ip', label: 'Destination IP', val: '10.0.0.1' },
    { id: 'dst_port', label: 'Destination Port', val: '443' },
    { id: 'dst_port_smb', label: 'SMB Port', fieldId: 'dst_port', val: '445' },
    { id: 'ja4', label: 'JA4 Fingerprint', val: 't13d8daaf6152771_a1b2_c3d4' },
    { id: 'tcp_state', label: 'TCP State', val: 'ESTABLISHED' },
    { id: 'tcp_rst', label: 'TCP Reset (RST)', fieldId: 'tcp_state', val: 'RST' },
  ];

  useEffect(() => {
    loadExplanation(fieldKey, fieldValue);
  }, [fieldKey, fieldValue]);

  const loadExplanation = async (id: string, val: string) => {
    const data = await getFieldExplanation(id, val);
    if (data) {
      setExplanation(data);
    } else {
      // Fallback object for browser preview mode
      setExplanation({
        field_id: id,
        title: `Field: ${id}`,
        category: 'NETWORK',
        short_description: `Contextual inspection of ${id} field value: ${val}`,
        detailed_explanation: `In network analysis, ${id} represents traffic metadata evaluated against baseline standards.`,
        current_value: val,
        interpretation: `Observed value ${val} in current flow session.`,
        status_level: 'OBSERVED',
        evidence: [`Field ${id}: ${val}`],
        related_entities: ['source_ip', 'destination_ip'],
        analyst_next_steps: [
          'Review related flow duration and byte volume.',
          'Inspect correlated detection findings.',
        ],
      });
    }
  };

  const handleSelectField = (id: string, actualFieldId: string, val: string) => {
    setFieldKey(actualFieldId);
    setFieldValue(val);
  };

  return (
    <div className="bg-[#050b18]/95 border border-[#142646] rounded-xl p-6 shadow-2xl space-y-6 backdrop-blur-xl font-mono text-xs max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#142646] pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
            EDU-INSPECTOR — CONTEXTUAL FIELD &amp; EVIDENCE EXPLANATION ENGINE
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Field Selector Pill Bar */}
      <div className="flex flex-wrap gap-2">
        {availableFields.map((item) => {
          const actualId = item.fieldId || item.id;
          const isActive = fieldKey === actualId && fieldValue === item.val;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectField(item.id, actualId, item.val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500 shadow-md shadow-cyan-500/20'
                  : 'bg-black/60 text-slate-400 border-[#142646] hover:border-slate-500'
              }`}
            >
              {item.label} ({item.val})
            </button>
          );
        })}
      </div>

      {/* Progressive Disclosure Level Tabs */}
      <div className="flex items-center gap-2 border-b border-[#142646] pb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">
          PROGRESSIVE DISCLOSURE:
        </span>
        {[
          { level: 1, label: 'L1: Overview' },
          { level: 2, label: 'L2: Technical Details' },
          { level: 3, label: 'L3: Evidence & Interpretation' },
          { level: 4, label: 'L4: Analyst Next Steps' },
        ].map((lvl) => (
          <button
            key={lvl.level}
            onClick={() => setActiveLevel(lvl.level)}
            className={`px-3 py-1 rounded font-mono text-xs font-bold border transition-all cursor-pointer ${
              activeLevel === lvl.level
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                : 'bg-slate-900/60 text-slate-400 border-[#142646] hover:text-slate-200'
            }`}
          >
            {lvl.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {explanation && (
        <div className="bg-[#030712] border border-[#142646] rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#142646] pb-3">
            <div>
              <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider">
                CATEGORY: {explanation.category}
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">{explanation.title}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded font-mono text-xs font-bold border ${
                  explanation.status_level === 'SUSPICIOUS'
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                }`}
              >
                STATUS: {explanation.status_level}
              </span>
            </div>
          </div>

          {/* Level 1: Overview */}
          {activeLevel === 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-bold">
                <Info className="w-4 h-4" />
                <span>SUMMARY &amp; PURPOSE</span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">{explanation.short_description}</p>
              <div className="bg-slate-900/80 border border-[#142646] rounded-lg p-3 mt-3">
                <span className="text-[11px] font-mono text-slate-400 block mb-1">OBSERVED VALUE:</span>
                <code className="text-cyan-300 font-mono font-bold text-sm">{explanation.current_value}</code>
              </div>
            </div>
          )}

          {/* Level 2: Technical Details */}
          {activeLevel === 2 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold">
                <Code className="w-4 h-4" />
                <span>TECHNICAL DEEP-DIVE &amp; RFC BACKGROUND</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed font-sans">{explanation.detailed_explanation}</p>
            </div>
          )}

          {/* Level 3: Evidence & Interpretation */}
          {activeLevel === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400 font-bold">
                <ShieldAlert className="w-4 h-4" />
                <span>EVIDENCE-GROUNDED INTERPRETATION</span>
              </div>
              <p className="text-amber-200 text-xs font-sans bg-amber-950/20 border border-amber-500/30 rounded-lg p-3">
                {explanation.interpretation}
              </p>

              <div className="space-y-1">
                <span className="text-[11px] font-mono text-slate-400 block">OBSERVED EVIDENCE:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-xs">
                  {explanation.evidence.map((ev, idx) => (
                    <li key={idx} className="font-mono">{ev}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Level 4: Analyst Next Steps */}
          {activeLevel === 4 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-bold">
                <Terminal className="w-4 h-4" />
                <span>RECOMMENDED ANALYST INVESTIGATION STEPS</span>
              </div>
              <div className="space-y-2">
                {explanation.analyst_next_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-black/60 border border-[#142646] p-2.5 rounded-lg text-slate-200 text-xs"
                  >
                    <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
