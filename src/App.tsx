import React, { useEffect, useState } from 'react';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import type { TabType } from './components/Sidebar';
import { GlobalIntelView } from './components/GlobalIntelView';
import { ConversationTable } from './components/ConversationTable';
import { StorylineInspector } from './components/StorylineInspector';
import { EvidencePanel } from './components/EvidencePanel';
import { AttackGraph as AttackGraphPanel } from './components/AttackGraph';
import { EduInspectorModal } from './components/EduInspectorModal';
import { ScenarioLabs } from './components/ScenarioLabs';
import { DetectionBuilder } from './components/DetectionBuilder';
import { AuditAndIOCs } from './components/AuditAndIOCs';
import { SystemLogs } from './components/SystemLogs';
import { HybridIntel } from './components/HybridIntel';
import { UserProfileView } from './components/UserProfileView';
import { AdminPanelView } from './components/AdminPanelView';
import { AuthModal } from './components/AuthModal';
import type { LocationNode } from './components/Globe3D';
import { PanelLeft } from 'lucide-react';
import { authSession, authLogout } from './services/tauri/auth';
import { getActiveFlows } from './services/tauri/flows';
import { getDetections } from './services/tauri/detections';
import { getAttackGraph, subscribeToGraphEvents } from './services/tauri/graph';
import type { FlowRecord } from './services/tauri/flows';
import type { DetectionFinding } from './services/tauri/detections';
import type { AttackGraph } from './services/tauri/graph';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('global_intel');
  const [selectedNode, setSelectedNode] = useState<LocationNode | null>(null);
  const [searchOpenToken, setSearchOpenToken] = useState<number>(0);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  // Sidebar Slide States
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isFullyHidden, setIsFullyHidden] = useState<boolean>(false);

  // User Auth State
  const [user, setUser] = useState<{ id?: string; name: string; email: string; role?: string; isVerified: boolean } | null>(null);

  // Restore persisted local session on startup (backend-validated)
  useEffect(() => {
    const stored = localStorage.getItem('netoze_token');
    if (!stored) return;
    authSession(stored)
      .then((u) => {
        if (u) {
          setUser({ id: u.id, name: u.name, email: u.email, role: u.role, isVerified: true });
        } else {
          localStorage.removeItem('netoze_token');
        }
      })
      .catch(() => {
        localStorage.removeItem('netoze_token');
      });
  }, []);

  // Live Data States
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [events, setEvents] = useState<DetectionFinding[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<AttackGraph>({ nodes: [], edges: [] });

  const loadLiveData = async () => {
    try {
      const [flowData, detections, graph] = await Promise.all([
        getActiveFlows(100),
        getDetections(100),
        getAttackGraph(),
      ]);
      setFlows(flowData);
      setEvents(detections);
      setGraphData(graph);
    } catch (err) {
      console.error('Error loading NET0ZE live data:', err);
    }
  };

  useEffect(() => {
    loadLiveData();
    const interval = window.setInterval(loadLiveData, 5000);
    let unsubscribe: () => void = () => {};
    subscribeToGraphEvents((graph) => setGraphData(graph)).then((u) => (unsubscribe = u));
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Keyboard shortcut handler for CTRL + K (geo search lives in GlobalIntelView)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAuthOpen(false);
        setSelectedField(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    const stored = localStorage.getItem('netoze_token');
    if (stored) void authLogout(stored).catch(() => {});
    localStorage.removeItem('netoze_token');
    setUser(null);
    setActiveTab('user_profile');
  };

  const handleSelectFlow = (flowId: string) => {
    setSelectedFlowId(flowId);
    setActiveTab('storyline');
  };

  const selectedFlow = flows.find((f) => f.flow_id === selectedFlowId) || flows[0] || null;
  const severityRank: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };

  const hostSeverity = (ip: string): string => {
    const sevs = flows
      .filter((f) => f.src_ip === ip || f.dst_ip === ip)
      .map((f) => f.severity)
      .filter((s) => s && s !== 'UNKNOWN');
    if (sevs.length === 0) return 'INFO';
    let top = sevs[0];
    for (const s of sevs) if ((severityRank[s] ?? 0) > (severityRank[top] ?? 0)) top = s;
    return top;
  };

  const graphForPanel = {
    nodes: graphData.nodes.map((n) => ({
      id: n.node_id,
      label: n.label,
      type: n.node_type,
      max_severity: hostSeverity(n.node_id),
    })),
    edges: graphData.edges.map((e) => ({
      id: e.edge_id,
      source: e.source_node,
      target: e.destination_node,
      protocol: e.relationship,
      count: 1,
      max_severity: hostSeverity(e.destination_node),
      threat_score: Math.round(e.confidence * 100),
    })),
  };
  const rawEvent = events.find((e) => e.finding_id === selectedFlowId) || events[0] || null;
  const selectedEvent = rawEvent
    ? {
        ...rawEvent,
        storyline_summary: rawEvent.description,
        technical_explanation: rawEvent.evidence,
        mitre_attack: [],
        suggested_actions: [],
        educational_insight: undefined,
      }
    : null;

  return (
    <div className="w-screen h-screen flex flex-col bg-black text-slate-200 overflow-hidden font-sans select-none">
      {/* Top Navbar */}
      <TopNavbar
        onOpenSearch={() => setSearchOpenToken((t) => t + 1)}
        onOpenAuth={() => setIsAuthOpen(true)}
        user={user}
        onLogout={handleLogout}
        isFullyHidden={isFullyHidden}
        setIsFullyHidden={setIsFullyHidden}
      />

      {/* Main Body: Left Sidebar + Active View Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Floating Slide-Out Toggle Button when Sidebar is fully hidden */}
        {isFullyHidden && (
          <button
            onClick={() => setIsFullyHidden(false)}
            className="absolute top-3 left-3 z-40 p-2 rounded-md bg-cyan-950/90 text-cyan-400 border border-cyan-500 shadow-xl flex items-center gap-1.5 font-mono text-xs font-bold hover:bg-cyan-900 transition-colors cursor-pointer animate-pulse"
          >
            <PanelLeft className="w-4 h-4" />
            <span>OPEN NAVIGATION</span>
          </button>
        )}

        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          isFullyHidden={isFullyHidden}
          setIsFullyHidden={setIsFullyHidden}
        />

        {/* View Routing Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden relative bg-black">
          {activeTab === 'global_intel' && (
            <GlobalIntelView
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              setActiveTab={setActiveTab}
              openSearchToken={searchOpenToken}
            />
          )}

          {activeTab === 'conversations' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <ConversationTable
                flows={flows.map((f) => ({ ...f, confidence: 0 }))}
                selectedFlowId={selectedFlowId}
                onSelectFlow={handleSelectFlow}
                onInspectField={(f) => setSelectedField(f)}
              />
            </div>
          )}

          {activeTab === 'storyline' && (
            <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StorylineInspector
                event={selectedEvent}
                onInspectField={(f) => setSelectedField(f)}
              />
              <EvidencePanel
                flow={selectedFlow}
                onInspectField={(f) => setSelectedField(f)}
              />
            </div>
          )}

          {activeTab === 'attack_graph' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <AttackGraphPanel graphData={graphForPanel} flows={flows} />
            </div>
          )}

          {activeTab === 'network_engine' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <HybridIntel />
            </div>
          )}

          {activeTab === 'system_logs' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <SystemLogs />
            </div>
          )}

          {activeTab === 'edu_inspector' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <EduInspectorModal
                selectedField={selectedField || 'ja4'}
                onClose={() => setSelectedField(null)}
              />
            </div>
          )}

          {activeTab === 'scenario_labs' && (
            <ScenarioLabs />
          )}

          {activeTab === 'detection_builder' && (
            <DetectionBuilder />
          )}

          {activeTab === 'ioc_threat' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <AuditAndIOCs />
            </div>
          )}

          {activeTab === 'user_profile' && (
            <UserProfileView
              user={user}
              onOpenAuth={() => setIsAuthOpen(true)}
              onLogout={handleLogout}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'admin_panel' && (
            <AdminPanelView />
          )}
        </main>
      </div>

      {/* Field Inspection Modal Overlay */}
      {selectedField && activeTab !== 'edu_inspector' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <EduInspectorModal
              selectedField={selectedField}
              onClose={() => setSelectedField(null)}
            />
          </div>
        </div>
      )}

      {/* Login & Sign Up Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(userData) => {
          setUser(userData);
          if (userData.role === 'admin') setActiveTab('global_intel');
          else setActiveTab('user_profile');
        }}
      />
    </div>
  );
};

export default App;
