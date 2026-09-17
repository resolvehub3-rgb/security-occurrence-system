import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { DutyReport, Occurrence } from '../../types';
import {
  formatGhanaDate,
  formatGhanaShortTime,
  formatGhanaDateTime,
  formatGhanaTime,
} from '../../utils/timezone';
import {
  Calendar,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  X,
  Building,
  Image as ImageIcon,
  Video,
  FileText,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const OfficerHistory: React.FC = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<DutyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<DutyReport | null>(null);
  const [reportOccurrences, setReportOccurrences] = useState<Occurrence[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const fetchReports = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('duty_reports')
        .select(`
          *,
          station:stations(*),
          session:duty_sessions(*),
          manager:profiles!duty_reports_manager_id_fkey(*)
        `)
        .eq('officer_id', user.id)
        .order('officer_submitted_at', { ascending: false });

      if (error) {
        console.error('Error fetching officer reports:', error);
      } else {
        setReports((data as DutyReport[]) || []);
      }
    } catch (err) {
      console.error('History load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleOpenReportDetails = async (report: DutyReport) => {
    setSelectedReport(report);
    setLoadingDetails(true);
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
      console.error('Error loading occurrences:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'finalized':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Finalized
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> Needs Correction
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" /> Under Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3 h-3" /> Submitted
          </span>
        );
    }
  };

  return (
    <div className="max-w-md mx-auto py-5 px-4 space-y-4 pb-24 animate-fade-in">
      <div className="flex items-center justify-between pb-1">
        <div>
          <h2 className="text-base font-bold text-stone-900">Duty Report History</h2>
          <p className="text-xs text-stone-500">Your historical submitted shift reports & reviews</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700">
          {reports.length} Reports
        </span>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading duty history…</p>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No reports available."
          description="Your submitted reports and occurrence records from completed duty shifts will be preserved here."
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              onClick={() => handleOpenReportDetails(report)}
              className="p-4 bg-white rounded-2xl border border-stone-200/90 shadow-2xs hover:border-orange-300 transition cursor-pointer space-y-2.5 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-stone-900">
                      {formatGhanaDate(report.officer_submitted_at)}
                    </div>
                    <div className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Building className="w-3 h-3 text-stone-400" />
                      <span>{report.station?.station_name || 'Assigned Station'}</span>
                    </div>
                  </div>
                </div>
                {getStatusBadge(report.status)}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-[11px] text-stone-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-stone-400" />
                  <span>
                    {formatGhanaShortTime(report.session?.started_at)} → {formatGhanaShortTime(report.session?.expected_end_at || report.officer_submitted_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-orange-600">
                  <span>View Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REPORT DETAIL DRAWER/MODAL */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 my-8 animate-fade-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-bold text-stone-900">Report Details</h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status & Station Info */}
            <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-stone-200/50">
                <span className="text-stone-500">Status:</span>
                {getStatusBadge(selectedReport.status)}
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Station:</span>
                <span className="font-semibold text-stone-900">{selectedReport.station?.station_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Duty Started:</span>
                <span className="font-semibold text-stone-900">{formatGhanaDateTime(selectedReport.session?.started_at)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Submitted:</span>
                <span className="font-semibold text-stone-900">{formatGhanaDateTime(selectedReport.officer_submitted_at)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-500">Manager:</span>
                <span className="font-semibold text-stone-900">{selectedReport.manager?.full_name || 'Station Manager'}</span>
              </div>
            </div>

            {/* Manager Correction or Comment Note if available */}
            {selectedReport.correction_reason && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Manager Correction Request</span>
                </div>
                <p className="leading-relaxed">{selectedReport.correction_reason}</p>
              </div>
            )}

            {selectedReport.manager_comments && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Manager Sign-Off Comments</span>
                </div>
                <p className="leading-relaxed">{selectedReport.manager_comments}</p>
              </div>
            )}

            {/* Logged Occurrences in this Report */}
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Shift Occurrences ({reportOccurrences.length})
              </h4>

              {loadingDetails ? (
                <div className="py-6 text-center text-xs text-stone-400">Loading entries…</div>
              ) : reportOccurrences.length === 0 ? (
                <div className="p-4 bg-stone-50 rounded-xl text-center text-xs text-stone-400">
                  No individual occurrences were saved for this duty session.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {reportOccurrences.map((occ, idx) => (
                    <div key={occ.id} className="p-3 rounded-xl bg-stone-50 border border-stone-200/70 text-xs space-y-1.5">
                      <div className="flex justify-between text-[11px] text-stone-500">
                        <span className="font-semibold text-stone-800">#{idx + 1} Occurrence</span>
                        <span>{formatGhanaTime(occ.occurrence_time)}</span>
                      </div>
                      <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">{occ.description}</p>
                      {occ.evidence && occ.evidence.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {occ.evidence.map((ev) => (
                            <a
                              key={ev.id}
                              href={ev.public_url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-stone-200 text-[10px] text-orange-600 hover:text-orange-700 font-medium truncate max-w-[200px]"
                            >
                              {ev.file_type.startsWith('video/') ? (
                                <Video className="w-3 h-3 text-orange-600" />
                              ) : (
                                <ImageIcon className="w-3 h-3 text-orange-600" />
                              )}
                              <span>{ev.file_name}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedReport(null)}
              className="w-full py-2.5 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
