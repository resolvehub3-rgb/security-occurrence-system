import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { DutyReport, DutySession, Occurrence, Station } from '../../types';
import {
  formatGhanaDateTime,
  formatGhanaShortTime,
  calculateRemainingSeconds,
  formatSecondsCountdown,
} from '../../utils/timezone';
import {
  Building,
  Users,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  ChevronRight,
  ShieldAlert,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { ManagerReportReviewModal } from './ManagerReportReviewModal';
import { EmptyState } from '../common/EmptyState';

export const ManagerDashboard: React.FC = () => {
  const { user, profile, assignedStation } = useAuth();

  const [activeStation, setActiveStation] = useState<Station | null>(assignedStation);
  const [activeSessions, setActiveSessions] = useState<DutySession[]>([]);
  const [pendingReports, setPendingReports] = useState<DutyReport[]>([]);
  const [recentFinalizedReports, setRecentFinalizedReports] = useState<DutyReport[]>([]);
  const [totalOccurrencesCount, setTotalOccurrencesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Review modal state
  const [selectedReport, setSelectedReport] = useState<DutyReport | null>(null);
  const [selectedReportOccurrences, setSelectedReportOccurrences] = useState<Occurrence[]>([]);
  const [loadingOccurrences, setLoadingOccurrences] = useState(false);

  // Fetch full manager station and metrics
  const fetchManagerData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const supabase = getSupabase();

      // 1. Fetch Station managed by this user (or find first station where manager_id = user.id)
      const { data: stationData } = await supabase
        .from('stations')
        .select('*')
        .eq('manager_id', user.id)
        .maybeSingle();

      const station = (stationData as Station) || assignedStation;
      setActiveStation(station);

      if (!station) {
        setLoading(false);
        return;
      }

      // 2. Fetch Active Duty Sessions for this station
      const { data: sessionsData } = await supabase
        .from('duty_sessions')
        .select(`
          *,
          officer:profiles!duty_sessions_officer_id_fkey(*)
        `)
        .eq('station_id', station.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      // Calculate occurrences count per session
      const sessionsWithOccs: DutySession[] = [];
      if (sessionsData) {
        for (const sess of sessionsData) {
          const { count } = await supabase
            .from('occurrences')
            .select('id', { count: 'exact', head: true })
            .eq('duty_session_id', sess.id);
          sessionsWithOccs.push({ ...sess, occurrences_count: count || 0 });
        }
      }
      setActiveSessions(sessionsWithOccs);

      // 3. Fetch Pending Reports (submitted or under_review)
      const { data: pendingData } = await supabase
        .from('duty_reports')
        .select(`
          *,
          officer:profiles!duty_reports_officer_id_fkey(*),
          session:duty_sessions(*),
          station:stations(*)
        `)
        .eq('station_id', station.id)
        .in('status', ['submitted', 'under_review'])
        .order('officer_submitted_at', { ascending: false });

      setPendingReports((pendingData as DutyReport[]) || []);

      // 4. Fetch Finalized Reports
      const { data: finalizedData } = await supabase
        .from('duty_reports')
        .select(`
          *,
          officer:profiles!duty_reports_officer_id_fkey(*),
          session:duty_sessions(*),
          station:stations(*)
        `)
        .eq('station_id', station.id)
        .eq('status', 'finalized')
        .order('manager_approved_at', { ascending: false })
        .limit(10);

      setRecentFinalizedReports((finalizedData as DutyReport[]) || []);

      // 5. Total Occurrences recorded at this station
      const { count: occCount } = await supabase
        .from('occurrences')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', station.id);

      setTotalOccurrencesCount(occCount || 0);
    } catch (err) {
      console.error('Manager dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, assignedStation]);

  useEffect(() => {
    fetchManagerData();

    if (!user) return;
    const supabase = getSupabase();

    // Subscribe to realtime changes on duty_sessions, duty_reports, occurrences, stations
    const channel = supabase
      .channel(`manager-dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_sessions' }, () => {
        fetchManagerData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_reports' }, () => {
        fetchManagerData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => {
        fetchManagerData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, () => {
        fetchManagerData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchManagerData]);

  const handleOpenReviewModal = async (report: DutyReport) => {
    setSelectedReport(report);
    setLoadingOccurrences(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('occurrences')
        .select(`
          *,
          evidence:occurrence_evidence(*)
        `)
        .eq('duty_session_id', report.duty_session_id)
        .order('occurrence_time', { ascending: true });

      setSelectedReportOccurrences((data as Occurrence[]) || []);
    } catch (err) {
      console.error('Error fetching occurrences:', err);
    } finally {
      setLoadingOccurrences(false);
    }
  };

  if (loading && !activeStation) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-10 h-10 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-stone-500 font-medium">Loading station operational dashboard…</p>
      </div>
    );
  }

  if (!activeStation) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <EmptyState
          icon={Building}
          title="No Station Assigned to Your Account"
          description="Your station manager profile is active, but you have not yet been linked to a specific security station. Please contact the System Administrator to configure your station assignment."
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* Station Information Card */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-orange-600/20 flex-shrink-0">
            <Building className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-stone-900 tracking-tight">{activeStation.station_name}</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                {activeStation.station_code}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-500 mt-1">
              <MapPin className="w-3.5 h-3.5 text-orange-600" />
              <span>{activeStation.location}</span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Operational Status: Active
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center">
          <button
            onClick={() => fetchManagerData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh State</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Metric 1: Active Officers on duty */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-1">
            <span>Active Officers</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">{activeSessions.length}</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">Currently on duty</div>
        </div>

        {/* Metric 2: Current Duty Sessions */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-1">
            <span>Duty Sessions</span>
            <Clock className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">{activeSessions.length}</div>
          <div className="text-[11px] text-stone-500 font-medium mt-1">6:00 PM → 6:00 AM shift</div>
        </div>

        {/* Metric 3: Pending Reports for Review */}
        <div className={`p-4 rounded-2xl border shadow-2xs ${
          pendingReports.length > 0 ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-stone-200/90'
        }`}>
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-1">
            <span>Pending Review</span>
            <AlertCircle className={`w-4 h-4 ${pendingReports.length > 0 ? 'text-amber-600 animate-pulse' : 'text-stone-400'}`} />
          </div>
          <div className={`text-2xl font-black ${pendingReports.length > 0 ? 'text-amber-900' : 'text-stone-900'}`}>
            {pendingReports.length}
          </div>
          <div className="text-[11px] text-stone-500 font-medium mt-1">Awaiting sign-off</div>
        </div>

        {/* Metric 4: Finalized Reports */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-1">
            <span>Finalized Reports</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">{recentFinalizedReports.length}</div>
          <div className="text-[11px] text-stone-500 font-medium mt-1">Approved & archived</div>
        </div>

        {/* Metric 5: Total Occurrences Recorded */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200/90 shadow-2xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium mb-1">
            <span>Total Occurrences</span>
            <ShieldAlert className="w-4 h-4 text-orange-600" />
          </div>
          <div className="text-2xl font-black text-stone-900">{totalOccurrencesCount}</div>
          <div className="text-[11px] text-stone-500 font-medium mt-1">Station logbook events</div>
        </div>
      </div>

      {/* Main Content Grid: Active Monitor & Pending Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Live Duty Session Monitor */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-bold text-stone-900">Live Duty Session Monitor</h2>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
              {activeSessions.length} Active
            </span>
          </div>

          {activeSessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400">
              No security officers currently on active duty at this station.
            </div>
          ) : (
            <div className="space-y-3">
              {activeSessions.map((session) => {
                const remaining = calculateRemainingSeconds(session.expected_end_at);
                return (
                  <div
                    key={session.id}
                    className="p-4 rounded-2xl bg-stone-50/80 border border-stone-200/70 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{session.officer?.full_name || 'Officer'}</span>
                        </div>
                        <div className="text-[11px] text-stone-500">
                          ID: {session.officer?.staff_id || 'SEC-OFFICER'}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md">
                          {formatSecondsCountdown(remaining)}
                        </span>
                        <div className="text-[10px] text-stone-400 mt-0.5">Remaining in Shift</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-stone-200/50 text-[11px] text-stone-600">
                      <span>Started: <strong>{formatGhanaShortTime(session.started_at)}</strong></span>
                      <span className="px-2 py-0.5 rounded-full bg-stone-200 text-stone-800 font-medium">
                        {session.occurrences_count || 0} occurrences logged
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Pending Reports For Review */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-bold text-stone-900">Submitted Reports for Review</h2>
            </div>
            {pendingReports.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                {pendingReports.length} Action Needed
              </span>
            )}
          </div>

          {pendingReports.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400">
              No reports pending manager review. All submitted reports are processed!
            </div>
          ) : (
            <div className="space-y-3">
              {pendingReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => handleOpenReviewModal(report)}
                  className="p-4 rounded-2xl bg-amber-50/50 hover:bg-amber-50 border border-amber-200/80 hover:border-amber-400 transition cursor-pointer space-y-2.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-stone-900">{report.officer?.full_name}</div>
                      <div className="text-[11px] text-stone-500">
                        Submitted: {formatGhanaDateTime(report.officer_submitted_at)}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-200/70 text-amber-900">
                      Review & Sign Off
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-amber-200/50 text-xs text-stone-600">
                    <span className="text-[11px]">Shift: {formatGhanaShortTime(report.session?.started_at)} → {formatGhanaShortTime(report.session?.expected_end_at)}</span>
                    <div className="flex items-center gap-1 font-semibold text-orange-600 text-xs">
                      <span>Inspect Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Finalized Reports Archive Table */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-stone-900">Recent Finalized Reports Archive</h2>
          </div>
          <span className="text-xs text-stone-500 font-medium">Locked & Signed Off</span>
        </div>

        {recentFinalizedReports.length === 0 ? (
          <div className="py-8 text-center text-xs text-stone-400">
            No finalized reports in archive yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50 text-[11px] uppercase font-bold text-stone-400 border-b border-stone-100">
                <tr>
                  <th className="py-3 px-4">Officer</th>
                  <th className="py-3 px-4">Shift Date</th>
                  <th className="py-3 px-4">Finalized At</th>
                  <th className="py-3 px-4">Manager Comments</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {recentFinalizedReports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-stone-50/60 transition">
                    <td className="py-3 px-4 font-semibold text-stone-900">{rep.officer?.full_name}</td>
                    <td className="py-3 px-4">{formatGhanaShortTime(rep.session?.started_at)}</td>
                    <td className="py-3 px-4 text-stone-500">{formatGhanaDateTime(rep.manager_approved_at)}</td>
                    <td className="py-3 px-4 text-stone-600 max-w-xs truncate">{rep.manager_comments || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Finalized
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report Review Modal */}
      {selectedReport && (
        <ManagerReportReviewModal
          report={selectedReport}
          occurrences={selectedReportOccurrences}
          onClose={() => setSelectedReport(null)}
          onActionComplete={() => {
            fetchManagerData();
          }}
        />
      )}
    </div>
  );
};
