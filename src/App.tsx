import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Box,
  Brain,
  Building2,
  Camera,
  CheckSquare,
  Cpu,
  Eye,
  GitBranch,
  HeartPulse,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Plug,
  Radio,
  Shield,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { vantaApi } from './api/client';
import { AuthPortal } from './components/AuthPortal';
import {
  AdministrationView,
  IntegrationsView,
  KnowledgeCenterView,
  OperationsWorkflowsView,
  SecurityGovernanceView,
  SystemHealthView,
} from './components/GovernanceAndPlatform';
import {
  AssetIntelligenceView,
  DigitalTwinView,
  InfrastructureView,
  IoTTelemetryView,
} from './components/InfrastructureAndTwin';
import {
  AIAgentsView,
  EnergyIntelligenceView,
  PredictiveMaintenanceView,
  RootCauseAnalysisView,
} from './components/IntelligenceModules';
import {
  AnalyticsReportsView,
  CommandCenterView,
  OverviewView,
} from './components/OverviewAndCommand';
import { VantaBrainView } from './components/VantaBrainView';
import { CameraManagementView, VisionIntelligenceView } from './components/VisionAndCameras';
import type { NavigationSection, UserSession } from './core/types';
import type { SystemHealthStatus, WorkspaceData } from './types/workspace';

interface NavGroup {
  label: string;
  items: Array<{ id: NavigationSection; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

class WorkspaceErrorBoundary extends React.Component<
  { activeSection: string; onReset: () => void; children: React.ReactNode },
  { hasError: boolean; errorMessage: string | null }
> {
  constructor(props: { activeSection: string; onReset: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected module render error.',
    };
  }

  componentDidUpdate(prevProps: { activeSection: string }) {
    if (prevProps.activeSection !== this.props.activeSection && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="bg-[#111827] border border-rose-800/80 rounded-lg p-6 space-y-3 text-xs text-slate-200"
        >
          <div className="font-mono text-rose-400 font-semibold">
            MODULE RENDER FAULT ISOLATED ({this.props.activeSection})
          </div>
          <p className="text-slate-300">{this.state.errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, errorMessage: null });
              this.props.onReset();
            }}
            className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
          >
            Reload Workspace Context
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Command',
    items: [
      { id: 'overview', label: '1. Overview', icon: LayoutDashboard },
      { id: 'command-center', label: '2. Command Center', icon: Activity },
      { id: 'vanta-brain', label: '3. VANTA Brain', icon: Brain },
    ],
  },
  {
    label: 'Perception',
    items: [
      { id: 'vision-intelligence', label: '4. Vision Intelligence', icon: Eye },
      { id: 'camera-management', label: '5. Camera Management', icon: Camera },
      { id: 'iot-telemetry', label: '8. IoT & Telemetry', icon: Radio },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { id: 'infrastructure', label: '6. Infrastructure', icon: Building2 },
      { id: 'asset-intelligence', label: '7. Asset Intelligence', icon: Cpu },
      { id: 'digital-twin', label: '9. Digital Twin', icon: Box },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'predictive-maintenance', label: '10. Predictive Maint.', icon: Wrench },
      { id: 'energy-intelligence', label: '11. Energy Intelligence', icon: Zap },
      { id: 'root-cause-analysis', label: '12. Root Cause Analysis', icon: GitBranch },
      { id: 'ai-agents', label: '13. AI Agents', icon: Bot },
    ],
  },
  {
    label: 'Operations & Governance',
    items: [
      { id: 'operations-workflows', label: '14. Operations & Approvals', icon: CheckSquare },
      { id: 'knowledge-center', label: '15. Knowledge Center', icon: BookOpen },
      { id: 'security-governance', label: '16. Security & Governance', icon: Shield },
      { id: 'analytics-reports', label: '17. Analytics & Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'integrations', label: '18. Integrations', icon: Plug },
      { id: 'administration', label: '19. Administration', icon: Users },
      { id: 'system-health', label: '20. System Health', icon: HeartPulse },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeSection, setActiveSection] = useState<NavigationSection>('overview');
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('ALL');
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const workspaceReqIdRef = useRef(0);

  const loadWorkspace = useCallback(async (facilityId: string) => {
    const reqId = ++workspaceReqIdRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const [ws, sysHealth] = await Promise.all([
        vantaApi.getWorkspace(facilityId),
        vantaApi.getHealth(),
      ]);
      if (reqId !== workspaceReqIdRef.current) return;
      setWorkspace(ws);
      setHealth(sysHealth);
    } catch (err) {
      if (reqId !== workspaceReqIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load workspace.';
      if (message.toLowerCase().includes('authentication required') || message.includes('401') || message.toLowerCase().includes('suspended')) {
        setUser(null);
        return;
      }
      setLoadError(message);
    } finally {
      if (reqId === workspaceReqIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initAuth() {
      try {
        const [sessionRes, authConfig] = await Promise.all([
          vantaApi.getSession(),
          vantaApi.getAuthConfig().catch(() => ({ allowDemoAuth: false })),
        ]);
        if (!active) return;
        if (sessionRes.authenticated && sessionRes.user) {
          setUser(sessionRes.user);
          return;
        }
        const params = new URLSearchParams(window.location.search);
        if (authConfig.allowDemoAuth && params.get('login') !== '1') {
          const demo = await vantaApi.login('ops.manager@apex-industrial.io', 'VantaDemo!2026');
          if (active) setUser(demo.user);
        }
      } catch {
        // Remain on AuthPortal if backend unreachable or demo auth disabled
      } finally {
        if (active) setAuthChecked(true);
      }
    }
    initAuth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setWorkspace(null);
      return;
    }
    loadWorkspace(selectedFacilityId);
  }, [user, selectedFacilityId, loadWorkspace]);

  // Live SSE Telemetry subscription using short-lived, single-use stream tickets
  useEffect(() => {
    if (!user) return;
    let active = true;
    let es: EventSource | null = null;

    vantaApi
      .getStreamTicket()
      .then(({ ticket }) => {
        if (!active) return;
        es = new EventSource(`/api/stream/telemetry?ticket=${encodeURIComponent(ticket)}`);
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as { type?: string };
            if (parsed.type === 'TELEMETRY_UPDATE') {
              loadWorkspace(selectedFacilityId);
            }
          } catch {
            // ignore heartbeat parse
          }
        };
      })
      .catch(() => {
        // SSE stream optional if session transitions
      });

    return () => {
      active = false;
      es?.close();
    };
  }, [user, selectedFacilityId, loadWorkspace]);

  const handleLogout = async () => {
    try {
      await vantaApi.logout();
    } catch {
      // Always clear client session state even if network call fails
    } finally {
      workspaceReqIdRef.current += 1;
      setUser(null);
      setWorkspace(null);
      setSelectedFacilityId('ALL');
      setActiveSection('overview');
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-xs font-mono text-slate-400">
        Initializing VANTA AI Session...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPortal
        onAuthenticated={(loggedInUser) => {
          setSelectedFacilityId('ALL');
          setUser(loggedInUser);
        }}
      />
    );
  }

  const activeNavMeta = ALL_NAV_ITEMS.find((item) => item.id === activeSection);

  const renderContent = () => {
    if (loadError) {
      return (
        <div role="alert" className="p-5 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-200 space-y-2">
          <div className="font-semibold">Workspace Load Error</div>
          <div>{loadError}</div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => loadWorkspace(selectedFacilityId)}
              className="px-3 py-1.5 rounded bg-rose-800 hover:bg-rose-700 text-white text-xs"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded border border-rose-700 text-rose-200 text-xs"
            >
              Switch Operator Account
            </button>
          </div>
        </div>
      );
    }

    if (!workspace) {
      return (
        <div className="space-y-4">
          <div className="h-16 bg-[#111827] border border-[#1E293B] rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-28 bg-[#111827] border border-[#1E293B] rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      );
    }

    const refresh = () => loadWorkspace(selectedFacilityId);

    switch (activeSection) {
      case 'overview':
        return <OverviewView data={workspace} onNavigate={setActiveSection} />;
      case 'command-center':
        return <CommandCenterView data={workspace} onNavigate={setActiveSection} />;
      case 'vanta-brain':
        return (
          <VantaBrainView
            data={workspace}
            health={health}
            selectedFacilityId={selectedFacilityId}
            onNavigate={setActiveSection}
            onRefresh={refresh}
          />
        );
      case 'vision-intelligence':
        return <VisionIntelligenceView data={workspace} onRefresh={refresh} />;
      case 'camera-management':
        return <CameraManagementView data={workspace} onRefresh={refresh} />;
      case 'infrastructure':
        return <InfrastructureView data={workspace} />;
      case 'asset-intelligence':
        return <AssetIntelligenceView data={workspace} onRefresh={refresh} />;
      case 'iot-telemetry':
        return <IoTTelemetryView data={workspace} onRefresh={refresh} />;
      case 'digital-twin':
        return (
          <DigitalTwinView
            data={workspace}
            selectedFacilityId={selectedFacilityId}
            onRefresh={refresh}
          />
        );
      case 'predictive-maintenance':
        return <PredictiveMaintenanceView data={workspace} />;
      case 'energy-intelligence':
        return <EnergyIntelligenceView data={workspace} />;
      case 'root-cause-analysis':
        return <RootCauseAnalysisView data={workspace} onRefresh={refresh} />;
      case 'ai-agents':
        return <AIAgentsView data={workspace} onRefresh={refresh} />;
      case 'operations-workflows':
        return <OperationsWorkflowsView data={workspace} user={user} onRefresh={refresh} />;
      case 'knowledge-center':
        return <KnowledgeCenterView data={workspace} onRefresh={refresh} />;
      case 'security-governance':
        return <SecurityGovernanceView data={workspace} user={user} onSignedOut={() => setUser(null)} />;
      case 'analytics-reports':
        return <AnalyticsReportsView data={workspace} />;
      case 'integrations':
        return <IntegrationsView data={workspace} onRefresh={refresh} />;
      case 'administration':
        return <AdministrationView data={workspace} user={user} />;
      case 'system-health':
        return <SystemHealthView health={health} user={user} />;
      default:
        return <OverviewView data={workspace} onNavigate={setActiveSection} />;
    }
  };

  return (
    <div className="h-screen h-dvh overflow-hidden bg-[#0B0F17] text-[#E6EDF5] flex">
      {/* Desktop Sidebar — Stationary frame with independent vertical scroll region */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:h-full overflow-hidden border-r border-[#1E293B] bg-[#0E131D]">
        <div className="h-14 px-5 flex items-center justify-between border-b border-[#1E293B] shrink-0">
          <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
            VANTA AI
          </span>
          <Layers className="w-4 h-4 text-sky-400" />
        </div>

        <nav
          aria-label="Primary Platform Navigation"
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 space-y-5"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2.5 text-[11px] font-medium text-slate-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors text-left whitespace-nowrap ${
                      active
                        ? 'bg-sky-600/15 text-sky-400 border border-sky-500/30'
                        : 'text-slate-300 hover:bg-[#161E2E] hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#1E293B] text-xs space-y-1 shrink-0">
          <div className="font-medium text-slate-200 truncate">{user.fullName}</div>
          <div className="font-mono text-[11px] text-sky-400 truncate">{user.role}</div>
          <div className="font-mono text-[11px] text-slate-500 truncate">{user.organizationName}</div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0E131D] border-r border-[#1E293B] flex flex-col h-full overflow-hidden z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-[#1E293B] shrink-0">
              <span className="font-display text-base font-bold text-white">VANTA AI</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav
              aria-label="Mobile Navigation"
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-3 space-y-4"
            >
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-2 text-[11px] font-medium text-slate-500">{group.label}</div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveSection(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-md text-xs font-medium text-left ${
                          active ? 'bg-sky-600/20 text-sky-400' : 'text-slate-300 hover:bg-[#161E2E]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
            <div className="p-4 border-t border-[#1E293B] text-xs space-y-1 shrink-0">
              <div className="font-medium text-slate-200 truncate">{user.fullName}</div>
              <div className="font-mono text-[11px] text-sky-400 truncate">{user.role}</div>
              <div className="font-mono text-[11px] text-slate-500 truncate">{user.organizationName}</div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell — Stationary top header + independent scrollable main workspace */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
        {/* Clean 3-Zone Top Header */}
        <header className="h-14 px-4 lg:px-6 border-b border-[#1E293B] bg-[#0E131D] flex items-center justify-between gap-4 shrink-0">
          {/* Zone 1: Mobile trigger + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md border border-[#243044] text-slate-300"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 truncate">
              <span className="hidden sm:inline text-slate-200 font-medium whitespace-nowrap">{user.organizationName}</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="truncate text-slate-200 sm:text-slate-400">{activeNavMeta?.label || 'Overview'}</span>
            </div>
          </div>

          {/* Zone 2: Facility Scope Selector */}
          <div className="hidden md:flex items-center gap-3">
            <label htmlFor="facility-scope" className="text-xs text-slate-400 whitespace-nowrap">
              Facility Scope
            </label>
            <select
              id="facility-scope"
              value={selectedFacilityId}
              onChange={(e) => setSelectedFacilityId(e.target.value)}
              className="px-3 py-1.5 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100 max-w-xs"
            >
              <option value="ALL">All Authorized Facilities ({workspace?.facilities.length ?? 0})</option>
              {workspace?.facilities.map((fac) => (
                <option key={fac.id} value={fac.id}>
                  {fac.code} · {fac.name}
                </option>
              ))}
            </select>
          </div>

          {/* Zone 3: Primary Session Action */}
          <div className="flex items-center gap-3 shrink-0">
            {loading && <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">Syncing...</span>}
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md border border-[#243044] hover:border-slate-500 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Switch Operator / Sign Out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-5 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <WorkspaceErrorBoundary
              activeSection={activeSection}
              onReset={() => void loadWorkspace(selectedFacilityId)}
            >
              {renderContent()}
            </WorkspaceErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
