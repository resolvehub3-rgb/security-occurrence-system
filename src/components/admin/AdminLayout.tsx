import React, { useState, useEffect, useCallback } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { AdminStations } from './AdminStations';
import { AdminUsers } from './AdminUsers';
import { AdminGlobalOccurrences } from './AdminGlobalOccurrences';
import { AdminReports } from './AdminReports';
import { AdminAuditLogs } from './AdminAuditLogs';
import { getSupabase, getSupabaseConfig } from '../../lib/supabase';
import { safeFetchJson } from '../../lib/safeFetch';
import {
  LayoutDashboard,
  Building,
  Users,
  ShieldAlert,
  FileCheck,
  ClipboardList,
  Menu,
  X,
  Radio,
  RefreshCw,
  Clock,
} from 'lucide-react';

export type AdminTab = 'dashboard' | 'stations' | 'users' | 'occurrences' | 'reports' | 'audit';

interface NavItemConfig {
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Command metrics & activity',
  },
  {
    id: 'stations',
    label: 'Stations',
    icon: Building,
    description: 'Post assignments & managers',
  },
  {
    id: 'users',
    label: 'Personnel Directory',
    icon: Users,
    description: 'Managers, officers & credentials',
  },
  {
    id: 'occurrences',
    label: 'Live Occurrences',
    icon: ShieldAlert,
    description: 'Real-time security incidents',
  },
  {
    id: 'reports',
    label: 'Finalized Reports',
    icon: FileCheck,
    description: 'Manager-verified duty logs',
  },
  {
    id: 'audit',
    label: 'Audit Trail',
    icon: ClipboardList,
    description: 'Immutable system event log',
  },
];

export const AdminLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real-time counter metrics for sidebar badges
  const [sidebarCounts, setSidebarCounts] = useState<{
    stations: number;
    personnel: number;
    occurrences: number;
    reports: number;
    auditLogs: number;
  }>({
    stations: 0,
    personnel: 0,
    occurrences: 0,
    reports: 0,
    auditLogs: 0,
  });

  const fetchLiveCounts = useCallback(async () => {
    try {
      // Try server API first (bypasses RLS reliably)
      try {
        const config = getSupabaseConfig();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.url) headers['x-supabase-url'] = config.url;
        if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

        const result = await safeFetchJson('/api/admin/sidebar-counts', { headers });
        if (result.ok && result.data) {
          setSidebarCounts(result.data as typeof sidebarCounts);
          setLastSyncTime(new Date());
          return;
        }
      } catch (apiErr) {
        console.warn('Server API unavailable for sidebar counts, using fallback:', apiErr);
      }

      // Fallback: direct Supabase client queries
      const supabase = getSupabase();
      const [
        { count: stnCount },
        { count: userCount },
        { count: occCount },
        { count: repCount },
        { count: auditCount },
      ] = await Promise.all([
        supabase.from('stations').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('occurrences').select('id', { count: 'exact', head: true }),
        supabase.from('duty_reports').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
        supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
      ]);

      setSidebarCounts({
        stations: stnCount || 0,
        personnel: userCount || 0,
        occurrences: occCount || 0,
        reports: repCount || 0,
        auditLogs: auditCount || 0,
      });
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Error fetching sidebar realtime counts:', err);
    }
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchLiveCounts();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Real-time Supabase subscription across all key tables
  useEffect(() => {
    fetchLiveCounts();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-sidebar-realtime-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, () => fetchLiveCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchLiveCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => fetchLiveCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_reports' }, () => fetchLiveCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => fetchLiveCounts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLiveCounts]);

  const getBadgeContent = (id: AdminTab) => {
    switch (id) {
      case 'dashboard':
        return (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        );
      case 'stations':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
            {sidebarCounts.stations}
          </span>
        );
      case 'users':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
            {sidebarCounts.personnel}
          </span>
        );
      case 'occurrences':
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse" />
            {sidebarCounts.occurrences}
          </span>
        );
      case 'reports':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
            {sidebarCounts.reports}
          </span>
        );
      case 'audit':
        return (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
            {sidebarCounts.auditLogs > 999 ? '999+' : sidebarCounts.auditLogs}
          </span>
        );
      default:
        return null;
    }
  };

  const renderNavList = (onItemClick?: () => void) => (
    <div className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            id={`admin-nav-${item.id}`}
            onClick={() => {
              setActiveTab(item.id);
              if (onItemClick) onItemClick();
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-xs transition-all ${
              isActive
                ? 'bg-orange-500/10 text-orange-950 font-bold border-l-4 border-orange-600 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100/80 border-l-4 border-transparent'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
                  isActive ? 'bg-orange-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="font-semibold text-stone-900 leading-tight truncate">{item.label}</div>
                <div className="text-[10px] text-stone-400 font-normal leading-tight truncate">
                  {item.description}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 ml-2">{getBadgeContent(item.id)}</div>
          </button>
        );
      })}
    </div>
  );

  const activeItemConfig = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-stone-100/60 flex flex-col md:flex-row">
      {/* Mobile Top Sub-Header with Menu Toggle */}
      <div className="md:hidden bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between sticky top-16 z-30 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-orange-600 text-white">
            <activeItemConfig.icon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-stone-900 leading-tight">{activeItemConfig.label}</div>
            <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Active
            </div>
          </div>
        </div>

        <button
          id="admin-mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-700 text-xs font-semibold hover:bg-stone-100"
        >
          <Menu className="w-4 h-4 text-stone-600" />
          <span>Sidebar</span>
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col p-4 z-10 animate-fade-in">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-600" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-900">
                  Command Navigation
                </span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">{renderNavList(() => setMobileMenuOpen(false))}</div>

            {/* Mobile Footer Status */}
            <div className="pt-4 border-t border-stone-100 mt-2">
              <div className="flex items-center justify-between text-[11px] text-stone-500 mb-2">
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span>Real-Time Sync Active</span>
                </div>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="p-1 rounded hover:bg-stone-100 text-stone-600"
                  title="Manual refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="text-[10px] text-stone-400">
                Last sync: {lastSyncTime.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent Sticky Sidebar */}
      <aside
        id="admin-persistent-sidebar"
        aria-label="Security Administration Navigation"
        className="hidden md:flex w-64 lg:w-72 flex-shrink-0 bg-white border-r border-stone-200/90 flex-col justify-between self-start sticky top-16 h-[calc(100vh-4rem)] overflow-hidden z-20 shadow-xs"
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-stone-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Admin Navigation
            </span>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time
            </div>
          </div>
          <div className="text-xs font-bold text-stone-900 tracking-tight">Security Command Console</div>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">{renderNavList()}</div>

        {/* Sidebar Real-Time Status Card */}
        <div className="p-3 border-t border-stone-100 bg-stone-50/70">
          <div className="bg-white rounded-xl border border-stone-200/80 p-3 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800">
                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse flex-shrink-0" />
                <span>Live Supabase Stream</span>
              </div>
              <button
                id="admin-sidebar-refresh-btn"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
                title="Force refresh counts"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-orange-600' : ''}`} />
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-stone-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-stone-400" />
                Synced:
              </span>
              <span className="font-mono text-stone-700">{lastSyncTime.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto pb-16">
          {activeTab === 'dashboard' && (
            <AdminDashboard onNavigateTab={(tab: string) => setActiveTab(tab as AdminTab)} />
          )}
          {activeTab === 'stations' && <AdminStations />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'occurrences' && <AdminGlobalOccurrences />}
          {activeTab === 'reports' && <AdminReports />}
          {activeTab === 'audit' && <AdminAuditLogs />}
        </div>
      </main>
    </div>
  );
};
