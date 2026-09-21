import React, { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { safeFetchJson, sanitizeErrorMessage } from '../../lib/safeFetch';
import { getSupabaseConfig } from '../../lib/supabase';
import { Station, Occurrence } from '../../types';
import { formatGhanaDateTime, formatGhanaTime } from '../../utils/timezone';
import {
  Building,
  Users,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  Clock,
  CheckCircle2,
  RefreshCw,
  MapPin,
  TrendingUp,
} from 'lucide-react';

export const AdminDashboard: React.FC<{ onNavigateTab?: (tab: string) => void }> = ({ onNavigateTab }) => {
  const [metrics, setMetrics] = useState({
    totalOccurrences: 0,
    totalStations: 0,
    totalManagers: 0,
    totalOfficers: 0,
    activeSessions: 0,
    finalizedReports: 0,
  });

  const [stations, setStations] = useState<Station[]>([]);
  const [recentOccurrences, setRecentOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Fetch counts via server API (bypasses RLS reliably)
      let metricsData = {
        totalOccurrences: 0,
        totalStations: 0,
        totalManagers: 0,
        totalOfficers: 0,
        activeSessions: 0,
        finalizedReports: 0,
      };

      try {
        const config = getSupabaseConfig();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (config.url) headers['x-supabase-url'] = config.url;
        if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

        const result = await safeFetchJson('/api/admin/dashboard-stats', { headers });
        if (result.ok && result.data) {
          metricsData = result.data as typeof metricsData;
        }
      } catch {
        // Server API unavailable — will use direct Supabase fallback below
      }

      // If server API failed or returned nothing, fetch directly from Supabase
      if (metricsData.totalStations === 0 && metricsData.totalOccurrences === 0) {
        const [
          { count: occCount },
          { count: stnCount },
          { count: mgrCount },
          { count: offCount },
          { count: sessCount },
          { count: repCount },
        ] = await Promise.all([
          supabase.from('occurrences').select('id', { count: 'exact', head: true }),
          supabase.from('stations').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'manager'),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'officer'),
          supabase.from('duty_sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('duty_reports').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
        ]);

        metricsData = {
          totalOccurrences: occCount || 0,
          totalStations: stnCount || 0,
          totalManagers: mgrCount || 0,
          totalOfficers: offCount || 0,
          activeSessions: sessCount || 0,
          finalizedReports: repCount || 0,
        };
      }

      setMetrics(metricsData);

      // Stations overview with managers
      const { data: stData } = await supabase
        .from('stations')
        .select(`
          *,
          manager:profiles!stations_manager_id_fkey(*)
        `)
        .order('created_at', { ascending: false })
        .limit(6);

      setStations((stData as Station[]) || []);

      // Recent global occurrences
      const { data: occData } = await supabase
        .from('occurrences')
        .select(`
          *,
          station:stations(*),
          officer:profiles!occurrences_officer_id_fkey(*)
        `)
        .order('occurrence_time', { ascending: false })
        .limit(6);

      setRecentOccurrences((occData as Occurrence[]) || []);
    } catch (err) {
      console.error('Error loading admin dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_sessions' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_reports' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, () => fetchDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchDashboardData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDashboardData]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-stone-900 via-stone-900 to-stone-950 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-stone-950/30">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Security Command Center
              </h1>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-sm text-stone-400">
              Live operational oversight of all stations, personnel, and logbook occurrences
            </p>
          </div>

          <button
            onClick={() => fetchDashboardData()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-all duration-200 self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Occurrences */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('occurrences')}
          className="group relative bg-gradient-to-br from-orange-50 to-white rounded-3xl border border-orange-200/60 border-t-4 border-t-orange-500 p-5 shadow-sm hover:shadow-lg hover:shadow-orange-500/10 hover:scale-[1.02] transition-all duration-200 cursor-pointer animate-fade-in-up animate-fade-in-up-delay-1"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-orange-600/80 uppercase tracking-wider">Occurrences</span>
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
              <ShieldAlert className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <div className="text-4xl font-black text-orange-600 animate-count-up">{metrics.totalOccurrences}</div>
          <div className="text-[11px] text-orange-600/70 font-medium mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Realtime Event Stream
          </div>
        </div>

        {/* KPI 2: Total Stations */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('stations')}
          className="group relative bg-gradient-to-br from-blue-50 to-white rounded-3xl border border-blue-200/60 border-t-4 border-t-blue-500 p-5 shadow-sm hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.02] transition-all duration-200 cursor-pointer animate-fade-in-up animate-fade-in-up-delay-2"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-blue-600/80 uppercase tracking-wider">Stations</span>
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
              <Building className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="text-4xl font-black text-blue-600 animate-count-up">{metrics.totalStations}</div>
          <div className="text-[11px] text-blue-600/70 font-medium mt-2">Operational Facilities</div>
        </div>

        {/* KPI 3: Total Managers */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('users')}
          className="group relative bg-gradient-to-br from-violet-50 to-white rounded-3xl border border-violet-200/60 border-t-4 border-t-violet-500 p-5 shadow-sm hover:shadow-lg hover:shadow-violet-500/10 hover:scale-[1.02] transition-all duration-200 cursor-pointer animate-fade-in-up animate-fade-in-up-delay-3"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-violet-600/80 uppercase tracking-wider">Managers</span>
            <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
              <UserCheck className="w-5 h-5 text-violet-600" />
            </div>
          </div>
          <div className="text-4xl font-black text-violet-600 animate-count-up">{metrics.totalManagers}</div>
          <div className="text-[11px] text-violet-600/70 font-medium mt-2">Supervisory Staff</div>
        </div>

        {/* KPI 4: Total Officers */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('users')}
          className="group relative bg-gradient-to-br from-emerald-50 to-white rounded-3xl border border-emerald-200/60 border-t-4 border-t-emerald-500 p-5 shadow-sm hover:shadow-lg hover:shadow-emerald-500/10 hover:scale-[1.02] transition-all duration-200 cursor-pointer animate-fade-in-up animate-fade-in-up-delay-4"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-600/80 uppercase tracking-wider">Officers</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
              <Users className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="text-4xl font-black text-emerald-600 animate-count-up">{metrics.totalOfficers}</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {metrics.activeSessions} Currently on duty
          </div>
        </div>
      </div>

      {/* Secondary Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operational Stations Panel */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-stone-200/80 p-5 shadow-sm space-y-4 animate-fade-in-up animate-fade-in-up-delay-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Building className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-stone-900">Operational Security Stations</h2>
                <p className="text-[10px] text-stone-400 font-medium">Active posts & assignments</p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('stations')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Manage All
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </div>

          {stations.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
                <Building className="w-5 h-5 text-stone-400" />
              </div>
              <p className="text-xs font-semibold text-stone-600 mb-1">No stations yet</p>
              <p className="text-[11px] text-stone-400">Create your first station to get started</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stations.map((stn) => (
                <div
                  key={stn.id}
                  className="p-3.5 rounded-2xl bg-stone-50/80 border border-stone-200/50 hover:bg-stone-50 hover:border-stone-200 transition-all duration-150 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stn.status === 'active' ? 'bg-emerald-500' : 'bg-stone-300'}`} />
                    <div className="min-w-0">
                      <div className="font-bold text-stone-900 flex items-center gap-2">
                        <span className="truncate">{stn.station_name}</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white border border-stone-200 text-stone-500 flex-shrink-0">
                          {stn.station_code}
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{stn.location}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 ml-3">
                    <span className="text-[10px] text-stone-400 block uppercase tracking-wider">Manager</span>
                    <span className="font-semibold text-stone-700 text-[11px]">
                      {stn.manager?.full_name || 'Unassigned'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Live Occurrences Panel */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl border border-stone-200/80 p-5 shadow-sm space-y-4 animate-fade-in-up animate-fade-in-up-delay-6">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <ShieldAlert className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-stone-900">Live Global Occurrences</h2>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 text-[9px] font-bold uppercase">
                    <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                    Live
                  </span>
                </div>
                <p className="text-[10px] text-stone-400 font-medium">Real-time incident feed</p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('occurrences')}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
              >
                View Stream
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </div>

          {recentOccurrences.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
                <ShieldAlert className="w-5 h-5 text-stone-400" />
              </div>
              <p className="text-xs font-semibold text-stone-600 mb-1">No occurrences yet</p>
              <p className="text-[11px] text-stone-400">Incidents will appear here in real-time</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentOccurrences.map((occ) => (
                <div
                  key={occ.id}
                  className="relative p-3.5 rounded-2xl bg-white border border-stone-200/60 shadow-xs hover:shadow-sm transition-all duration-150 overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 to-orange-300 rounded-l-2xl" />
                  <div className="pl-2">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-stone-900 truncate">{occ.station?.station_name || 'Station'}</span>
                        <span className="text-stone-300">|</span>
                        <span className="text-stone-500 text-[11px] truncate">{occ.officer?.full_name || 'Officer'}</span>
                      </div>
                      <span className="text-[10px] text-stone-400 flex items-center gap-1 flex-shrink-0 ml-2">
                        <Clock className="w-3 h-3" />
                        {formatGhanaTime(occ.occurrence_time)}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
                      {occ.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
