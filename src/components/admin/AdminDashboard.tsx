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
    <div className="space-y-6 animate-fade-in">
      {/* Top Welcome & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Security Command Center</h1>
          <p className="text-xs text-stone-500">Live operational oversight of all stations, personnel, and logbook occurrences</p>
        </div>

        <button
          onClick={() => fetchDashboardData()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 transition self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Realtime</span>
        </button>
      </div>

      {/* Primary KPI Grid (Total Occurrences, Total Stations, Total Managers, Total Security Officers) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Occurrences */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('occurrences')}
          className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs hover:border-orange-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-2">
            <span>Total Occurrences</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-stone-900">{metrics.totalOccurrences}</div>
          <div className="text-[11px] text-orange-600 font-semibold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Realtime Event Stream
          </div>
        </div>

        {/* KPI 2: Total Stations */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('stations')}
          className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs hover:border-orange-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-2">
            <span>Total Stations</span>
            <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-stone-900">{metrics.totalStations}</div>
          <div className="text-[11px] text-stone-500 font-medium mt-1">Operational Facilities</div>
        </div>

        {/* KPI 3: Total Managers */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('users')}
          className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs hover:border-orange-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-2">
            <span>Station Managers</span>
            <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-stone-900">{metrics.totalManagers}</div>
          <div className="text-[11px] text-stone-500 font-medium mt-1">Supervisory Staff</div>
        </div>

        {/* KPI 4: Total Security Officers */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('users')}
          className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs hover:border-orange-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-2">
            <span>Security Officers</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-stone-900">{metrics.totalOfficers}</div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            {metrics.activeSessions} Currently on duty
          </div>
        </div>
      </div>

      {/* Secondary split: Operational Stations & Recent Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stations Overview */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-bold text-stone-900">Operational Security Stations</h2>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('stations')}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                Manage All
              </button>
            )}
          </div>

          {stations.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400">
              No stations registered yet. Click 'Manage All' to create your first station.
            </div>
          ) : (
            <div className="space-y-3">
              {stations.map((stn) => (
                <div
                  key={stn.id}
                  className="p-3.5 rounded-2xl bg-stone-50/70 border border-stone-200/60 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-stone-900 flex items-center gap-2">
                      <span>{stn.station_name}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-white border border-stone-200 text-stone-600">
                        {stn.station_code}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-stone-400" />
                      <span>{stn.location}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] text-stone-500 block">Manager:</span>
                    <span className="font-semibold text-stone-800 text-[11px]">
                      {stn.manager?.full_name || 'Unassigned'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Live Occurrences Stream */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-bold text-stone-900">Live Global Occurrences</h2>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('occurrences')}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                View Stream
              </button>
            )}
          </div>

          {recentOccurrences.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400">
              No occurrences logged in the system yet.
            </div>
          ) : (
            <div className="space-y-3">
              {recentOccurrences.map((occ) => (
                <div
                  key={occ.id}
                  className="p-3.5 rounded-2xl bg-white border border-stone-200/80 shadow-2xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">{occ.station?.station_name || 'Station'}</span>
                      <span className="text-stone-400">•</span>
                      <span className="text-stone-600 text-[11px]">{occ.officer?.full_name || 'Officer'}</span>
                    </div>
                    <span className="text-[10px] text-stone-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatGhanaTime(occ.occurrence_time)}
                    </span>
                  </div>

                  <p className="text-xs text-stone-700 leading-relaxed line-clamp-2">
                    {occ.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
