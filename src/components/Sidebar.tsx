import React from 'react';
import {
  Globe,
  MessageSquare,
  Terminal,
  Cpu,
  Layers,
  GitFork,
  ShieldAlert,
  FlaskConical,
  Sliders,
  Target,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose
} from 'lucide-react';

export type TabType =
  | 'global_intel'
  | 'conversations'
  | 'system_logs'
  | 'network_engine'
  | 'storyline'
  | 'attack_graph'
  | 'edu_inspector'
  | 'scenario_labs'
  | 'detection_builder'
  | 'ioc_threat'
  | 'user_profile'
  | 'admin_panel';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  user: { name: string; email: string; role?: string; isVerified: boolean } | null;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isFullyHidden: boolean;
  setIsFullyHidden: (hidden: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  isCollapsed,
  setIsCollapsed,
  isFullyHidden,
  setIsFullyHidden
}) => {
  const menuItems: { id: TabType; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'global_intel', label: 'Global Intel', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'conversations', label: 'Conversations', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'system_logs', label: 'System & Logs', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'network_engine', label: 'Network Engine', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'storyline', label: 'Storyline & Evidence', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'attack_graph', label: 'Attack Graph', icon: <GitFork className="w-3.5 h-3.5" /> },
    { id: 'edu_inspector', label: 'EDU-Inspector', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
    { id: 'scenario_labs', label: 'Scenario Labs', icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { id: 'detection_builder', label: 'Detection Builder', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'ioc_threat', label: 'IOC & Threat Intel', icon: <Target className="w-3.5 h-3.5" /> },
    { id: 'user_profile', label: 'My User Profile', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'admin_panel', label: 'Admin User Management', icon: <Users className="w-3.5 h-3.5" />, adminOnly: true }
  ];

  const filteredMenuItems = menuItems.filter((item) => !item.adminOnly || user?.role === 'admin');

  if (isFullyHidden) return null;

  return (
    <aside
      className={`bg-[#050914] border-r border-[#142036] flex flex-col justify-between select-none shrink-0 py-2.5 transition-all duration-300 relative z-20 ${
        isCollapsed ? 'w-14' : 'w-48'
      }`}
    >
      {/* Header Controls */}
      <div className="px-2 mb-1.5 flex items-center justify-between border-b border-[#142036] pb-1.5">
        {!isCollapsed && (
          <span className="text-[9px] font-mono font-bold text-slate-400 tracking-wider uppercase px-1">
            NAVIGATION
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand Text Labels' : 'Collapse Text Labels'}
            className="p-1 rounded bg-[#0d172a] hover:bg-[#162746] text-cyan-400 border border-[#1f3357] transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsFullyHidden(true)}
            title="Slide Sidebar Completely Inside"
            className="p-1 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex flex-col gap-0.5 px-1.5 flex-1 overflow-y-auto">
        {filteredMenuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[11px] font-medium transition-all cursor-pointer group ${
                isActive
                  ? 'bg-[#0f1d35] text-cyan-400 font-semibold border-l-2 border-cyan-400 shadow-sm shadow-cyan-950/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1628]'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              <span
                className={`transition-colors ${
                  isActive ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'
                }`}
              >
                {item.icon}
              </span>

              {!isCollapsed && <span className="truncate text-[11px]">{item.label}</span>}

              {isActive && !isCollapsed && (
                <span className="absolute right-2 w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Profile Widget at Bottom */}
      <div className="px-1.5 pt-2 border-t border-[#142036]">
        <div
          onClick={() => setActiveTab('user_profile')}
          className={`flex items-center gap-2 p-1.5 rounded-md bg-[#0b1325] border border-[#17253f] hover:border-cyan-500/50 transition-colors cursor-pointer ${
            isCollapsed ? 'justify-center px-0' : ''
          }`}
        >
          <div className="relative w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
            <User className="w-3.5 h-3.5" />
            <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-400 border border-[#0b1325]" />
          </div>

          {!isCollapsed && (
            <div className="flex flex-col truncate">
              <span className="text-[11px] font-semibold text-slate-200 leading-tight truncate">
                {user ? user.name : 'Analyst'}
              </span>
              <span className="text-[9px] text-cyan-400 font-mono leading-tight">
                {user?.role === 'admin' ? 'ADMINISTRATOR' : 'ANALYST'}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
