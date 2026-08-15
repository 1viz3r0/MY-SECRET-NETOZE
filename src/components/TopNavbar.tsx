import React, { useEffect, useState } from 'react';
import {
  Search,
  User,
  ShieldCheck,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Monitor,
  Database,
  Cpu,
  AlertTriangle
} from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { getCapabilityStatus } from '../services/tauri/capabilities';
import type { CapabilityStatus } from '../services/tauri/capabilities';
import { getSystemInfo } from '../services/tauri/system';
import type { SystemInfo } from '../services/tauri/system';

interface TopNavbarProps {
  onOpenSearch: () => void;
  onOpenAuth: () => void;
  user: { name: string; email: string; isVerified: boolean; role?: string } | null;
  onLogout: () => void;
  isFullyHidden: boolean;
  setIsFullyHidden: (hidden: boolean) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onOpenSearch,
  onOpenAuth,
  user,
  onLogout,
  isFullyHidden,
  setIsFullyHidden
}) => {
  const [timeStr, setTimeStr] = useState<string>('14:32:18 UTC');
  const [dateStr, setDateStr] = useState<string>('06 May 2025');
  const [capabilities, setCapabilities] = useState<CapabilityStatus | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const mins = String(now.getUTCMinutes()).padStart(2, '0');
      const secs = String(now.getUTCSeconds()).padStart(2, '0');
      setTimeStr(`${hours}:${mins}:${secs} UTC`);

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = String(now.getUTCDate()).padStart(2, '0');
      const month = months[now.getUTCMonth()];
      const year = now.getUTCFullYear();
      setDateStr(`${day} ${month} ${year}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    // Fetch real native capability status
    getCapabilityStatus().then(setCapabilities);
    getSystemInfo().then(setSystemInfo);

    return () => clearInterval(interval);
  }, []);

  const isDesktop = isTauriEnvironment();

  return (
    <div className="flex flex-col shrink-0 select-none">
      {/* Top Runtime Mode Status Bar */}
      <div className={`px-3 py-1 text-[11px] font-mono flex items-center justify-between border-b ${
        isDesktop
          ? 'bg-cyan-950/80 border-cyan-800/80 text-cyan-200'
          : 'bg-amber-950/80 border-amber-800/80 text-amber-200'
      }`}>
        <div className="flex items-center gap-2">
          {isDesktop ? (
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="font-bold">
            {isDesktop ? 'NET0ZE DESKTOP RUNTIME (NATIVE TAURI v2)' : 'NET0ZE WEB DEVELOPMENT MODE'}
          </span>
          <span className="text-[10px] opacity-80 font-sans">
            — {isDesktop
              ? `Host: ${systemInfo?.hostname || 'LOCAL'} (${systemInfo?.os_name || 'Windows'}) | Admin: ${capabilities?.administrator ? 'ELEVATED' : 'STANDARD'}`
              : 'Desktop capability unavailable in browser mode.'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Database className="w-3 h-3 text-cyan-400" />
            <span>SQLite: <strong className="text-white font-mono">{isDesktop ? 'ACTIVE' : 'IN-MEMORY'}</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <Cpu className="w-3 h-3 text-purple-400" />
            <span>DuckDB: <strong className="text-white font-mono">{isDesktop ? 'ACTIVE' : 'IN-MEMORY'}</strong></span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px]">Npcap:</span>
            <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
              capabilities?.npcap?.installed
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {capabilities?.npcap?.installed ? 'INSTALLED' : 'NOT FOUND'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Top Header */}
      <header className="h-12 bg-[#070b16] border-b border-[#142036] px-3 flex items-center justify-between">
        {/* Brand, Version & Sidebar Toggle */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsFullyHidden(!isFullyHidden)}
            title={isFullyHidden ? 'Slide Sidebar Out' : 'Slide Sidebar Inside'}
            className={`p-1.5 rounded border transition-all cursor-pointer ${
              isFullyHidden
                ? 'bg-cyan-950 text-cyan-400 border-cyan-500 animate-pulse'
                : 'bg-[#0d1627] text-slate-300 border-[#1d2d4a] hover:text-white'
            }`}
          >
            {isFullyHidden ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-baseline gap-1.5">
            <span className="font-extrabold text-base tracking-wider text-white font-sans">
              NETOZE
            </span>
            <span className="text-[10px] font-semibold text-blue-400 bg-blue-950/80 px-1.5 py-0.2 rounded border border-blue-800/60 font-mono">
              v2.0.0
            </span>
          </div>
        </div>

        {/* Global Geo Search (CTRL + K) */}
        <div className="flex-1 max-w-lg mx-4">
          <div
            onClick={onOpenSearch}
            className="relative flex items-center bg-[#0d1627] hover:bg-[#111c33] border border-[#1d2d4a] hover:border-cyan-500/80 rounded-md px-2.5 py-1 cursor-pointer transition-all group"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 mr-2 transition-colors" />
            <span className="w-full text-[11px] text-slate-500 group-hover:text-slate-300 font-mono">
              Geo search — countries, states/provinces, cities…
            </span>
            <div className="flex items-center gap-0.5 ml-2 px-1 py-0.2 text-[9px] font-mono text-slate-400 bg-[#16233b] border border-[#213558] rounded">
              <span>CTRL</span>
              <span>+</span>
              <span>K</span>
            </div>
          </div>
        </div>

        {/* User Auth Profile Badge or Sign In Button */}
        <div className="flex items-center gap-2.5">
          {user ? (
            <div className="flex items-center gap-2 bg-[#0b1425] border border-cyan-500/60 px-2.5 py-0.5 rounded-md text-[11px] font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-white font-bold leading-tight text-[11px]">{user.name}</span>
                <span className={`text-[9px] leading-tight ${user.role === 'admin' ? 'text-cyan-400' : 'text-emerald-400'}`}>
                  {user.role === 'admin' ? 'ADMINISTRATOR' : 'ANALYST'}
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Sign Out"
                className="ml-1.5 text-slate-400 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-mono text-[11px] font-bold transition-colors cursor-pointer"
            >
              <User className="w-3 h-3" />
              <span>SIGN IN / REGISTER</span>
            </button>
          )}

          {/* UTC Clock */}
          <div className="flex flex-col text-right font-mono text-[11px] ml-1">
            <span className="text-slate-200 font-bold leading-tight">{timeStr}</span>
            <span className="text-slate-500 text-[9px] leading-tight">{dateStr}</span>
          </div>
        </div>
      </header>
    </div>
  );
};
