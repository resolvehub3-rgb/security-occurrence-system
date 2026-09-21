import React, { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { DutyReport, Occurrence } from '../../types';
import {
  formatGhanaDateTime,
  formatGhanaDate,
  formatGhanaShortTime,
  formatGhanaTime,
} from '../../utils/timezone';
import {
  FileText,
  Search,
  Building,
  User,
  Clock,
  CheckCircle2,
  Image as ImageIcon,
  Video,
  Printer,
  X,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const AdminReports: React.FC = () => {
  const [reports, setReports] = useState<DutyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState<DutyReport | null>(null);
  const [reportOccurrences, setReportOccurrences] = useState<Occurrence[]>([]);
  const [loadingOccs, setLoadingOccs] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('duty_reports')
        .select(`
          *,
          station:stations(*),
          officer:profiles!duty_reports_officer_id_fkey(*),
          manager:profiles!duty_reports_manager_id_fkey(*),
          session:duty_sessions(*)
        `)
        .eq('status', 'finalized')
        .order('manager_approved_at', { ascending: false });

      if (error) console.error('Error loading finalized reports:', error);
      setReports((data as DutyReport[]) || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duty_reports' }, () => {
        fetchReports();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReports]);

  const openReportDetails = async (report: DutyReport) => {
    setSelectedReport(report);
    setLoadingOccs(true);
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

      setReportOccurrences((data as Occurrence[]) || []);
    } catch (err) {
      console.error('Failed to load report occurrences:', err);
    } finally {
      setLoadingOccs(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      r.station?.station_name.toLowerCase().includes(q) ||
      r.officer?.full_name.toLowerCase().includes(q) ||
      r.manager?.full_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-gradient-to-r from-stone-900 via-stone-900 to-stone-950 rounded-3xl p-6 shadow-2xl shadow-stone-950/30">
        <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Finalized Shift Reports</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                <CheckCircle2 className="w-3 h-3" />
                {reports.length} Reports
              </span>
            </div>
            <p className="text-sm text-stone-400">Authoritative, manager-approved and archived occurrence reports</p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search station, officer, manager..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs rounded-xl border border-white/10 bg-white/10 text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-56 sm:w-72"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center bg-gradient-to-br from-stone-50 to-white rounded-3xl border border-stone-200/60">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading finalized reports…</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports available."
          description={searchQuery ? 'No reports matched your search criteria.' : 'When station managers approve submitted shift reports, they will be archived here permanently.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReports.map((rep) => (
            <div
              key={rep.id}
              onClick={() => openReportDetails(rep)}
              className="p-5 bg-white/80 backdrop-blur-sm rounded-3xl border border-stone-200/80 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200 cursor-pointer space-y-3 animate-fade-in-up"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-stone-900">{rep.station?.station_name}</div>
                  <div className="text-xs text-stone-500">{rep.station?.station_code}</div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Finalized
                </span>
              </div>

              <div className="p-3.5 bg-stone-50/80 rounded-2xl border border-stone-200/50 text-xs space-y-1 text-stone-600">
                <div>Officer: <strong className="text-stone-900">{rep.officer?.full_name}</strong></div>
                <div>Manager: <strong className="text-stone-900">{rep.manager?.full_name}</strong></div>
                <div className="text-[11px] text-stone-400 pt-1 border-t border-stone-200/50">
                  Approved: {formatGhanaDateTime(rep.manager_approved_at)}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-orange-600 pt-1">
                <span>Inspect Full Report</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAILED REPORT INSPECTION MODAL */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-8 animate-fade-in max-h-[90vh] flex flex-col">
            <div className="bg-stone-900 text-white p-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-bold">Official Duty Occurrence Report</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
                  title="Print Report"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-200/60">
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Station</span>
                  <span className="font-bold text-stone-900 text-sm">{selectedReport.station?.station_name}</span>
                  <span className="text-stone-500 block">{selectedReport.station?.location}</span>
                </div>
                <div>
                  <span className="text-stone-400 block text-[10px] uppercase font-bold">Security Officer</span>
                  <span className="font-bold text-stone-900 text-sm">{selectedReport.officer?.full_name}</span>
                  <span className="text-stone-500 block">Badge ID: {selectedReport.officer?.staff_id || 'SEC'}</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-stone-200/50 flex justify-between">
                  <span>Duty Period: <strong>{formatGhanaDateTime(selectedReport.session?.started_at)}</strong> → <strong>{formatGhanaDateTime(selectedReport.officer_submitted_at)}</strong></span>
                  <span className="font-semibold text-emerald-700">Manager Approved</span>
                </div>
              </div>

              {selectedReport.manager_comments && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950">
                  <span className="font-bold block text-xs mb-1">Station Manager Sign-Off Comments:</span>
                  <p>{selectedReport.manager_comments}</p>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-bold uppercase tracking-wider text-stone-400 text-[11px]">
                  Logged Shift Occurrences ({reportOccurrences.length})
                </h4>

                {loadingOccs ? (
                  <div className="text-center py-6 text-stone-400">Loading occurrences…</div>
                ) : reportOccurrences.length === 0 ? (
                  <div className="text-center py-6 text-stone-400 bg-stone-50 rounded-2xl">
                    No occurrences recorded for this shift.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reportOccurrences.map((occ, i) => (
                      <div key={occ.id} className="p-4 rounded-2xl bg-stone-50 border border-stone-200/70 space-y-2">
                        <div className="flex justify-between text-[11px] text-stone-500">
                          <span className="font-bold text-stone-800">#{i + 1} Occurrence</span>
                          <span>{formatGhanaTime(occ.occurrence_time)}</span>
                        </div>
                        <p className="text-stone-800 leading-relaxed whitespace-pre-wrap">{occ.description}</p>
                        {occ.evidence && occ.evidence.length > 0 && (
                          <div className="pt-2 flex flex-wrap gap-2">
                            {occ.evidence.map((ev) => (
                              <a
                                key={ev.id}
                                href={ev.public_url || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-stone-200 text-[11px] text-orange-600 font-medium"
                              >
                                {ev.file_type.startsWith('video/') ? (
                                  <Video className="w-3.5 h-3.5 text-orange-600" />
                                ) : (
                                  <ImageIcon className="w-3.5 h-3.5 text-orange-600" />
                                )}
                                <span className="truncate max-w-[150px]">{ev.file_name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
