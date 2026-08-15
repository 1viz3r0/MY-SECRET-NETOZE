import React from 'react';
import { BookOpen, Info } from 'lucide-react';

export const ScenarioLabs: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col h-full bg-black text-slate-200 overflow-y-auto p-4 gap-4 font-mono text-xs">
      {/* Header */}
      <div className="cyber-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-500 flex items-center justify-center text-cyan-400">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white font-mono uppercase tracking-wider">
              INTERACTIVE SCENARIO LABS
            </h2>
            <p className="text-xs text-slate-400 font-sans">
              "Reads packets like a senior analyst, teaches like a professor."
            </p>
          </div>
        </div>
      </div>

      {/* Unavailable notice */}
      <div className="cyber-card p-6 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-slate-900 border border-[#142646] flex items-center justify-center text-slate-500">
          <Info className="w-7 h-7" />
        </div>
        <div>
          <div className="text-sm font-bold text-white uppercase tracking-wider mb-1">
            Lab Content Unavailable
          </div>
          <p className="text-xs text-slate-400 font-sans max-w-lg leading-relaxed">
            The guided scenario labs were previously served from the external Flask demo backend
            (<code className="text-cyan-300">127.0.0.1:5000/education/labs</code>), which is not part of the
            desktop build and is no longer running. No fabricated lab content is shipped in its place.
          </p>
          <p className="text-xs text-slate-500 font-sans max-w-lg leading-relaxed mt-2">
            Educational analysis for real detections remains available: select any detection in the
            Storyline Inspector, or use the Edu Inspector (CTRL+K → any field) for plain-language
            explanations of real capture fields.
          </p>
        </div>
      </div>
    </div>
  );
};
