import React, { useState } from 'react';
import { DutyReport, Occurrence } from '../../types';
import { getSupabase } from '../../lib/supabase';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';
import {
  formatGhanaDateTime,
  formatGhanaTime,
} from '../../utils/timezone';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Clock,
  Building,
  User,
  Image as ImageIcon,
  Video,
  Send,
  RotateCcw,
} from 'lucide-react';

interface ManagerReportReviewModalProps {
  report: DutyReport;
  occurrences: Occurrence[];
  onClose: () => void;
  onActionComplete: () => void;
}

export const ManagerReportReviewModal: React.FC<ManagerReportReviewModalProps> = ({
  report,
  occurrences,
  onClose,
  onActionComplete,
}) => {
  const { user, profile } = useAuth();
  const { sendNotification } = useNotifications();

  const [managerComments, setManagerComments] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [activeAction, setActiveAction] = useState<'view' | 'approve' | 'return'>('view');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Approve & Submit Final Report
  const handleApproveReport = async () => {
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      // 1. Update duty_reports to finalized
      const { error: repError } = await supabase
        .from('duty_reports')
        .update({
          status: 'finalized',
          manager_reviewed_at: now,
          manager_approved_at: now,
          manager_submitted_at: now,
          manager_comments: managerComments.trim() || null,
          updated_at: now,
        })
        .eq('id', report.id);

      if (repError) throw new Error(repError.message);

      // 2. Update duty_sessions to finalized
      const { error: sessError } = await supabase
        .from('duty_sessions')
        .update({
          status: 'finalized',
          updated_at: now,
        })
        .eq('id', report.duty_session_id);

      if (sessError) throw new Error(sessError.message);

      // 3. Notify officer that report has been approved
      if (report.officer_id) {
        await sendNotification({
          recipientUserId: report.officer_id,
          type: 'report_approved',
          title: 'Duty Report Approved',
          message: `Station Manager ${profile?.full_name || 'Manager'} approved your final duty report for ${
            report.station?.station_name || 'Station'
          }.`,
          relatedEntityId: report.id,
          relatedEntityType: 'duty_report',
        });
      }

      // 4. Notify Administrators of new final security report
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'admin');

      if (admins) {
        for (const admin of admins) {
          await sendNotification({
            recipientUserId: admin.id,
            type: 'report_finalized',
            title: 'New Final Security Report Finalized',
            message: `Manager ${profile?.full_name} finalized shift report for ${report.station?.station_name} with ${occurrences.length} occurrence(s).`,
            relatedEntityId: report.id,
            relatedEntityType: 'duty_report',
          });
        }
      }

      onActionComplete();
      onClose();
    } catch (err: any) {
      setErrorMsg(`Failed to approve report: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Return Report for Correction
  const handleReturnForCorrection = async () => {
    if (!user) return;
    if (!correctionReason.trim()) {
      setErrorMsg('A detailed reason for returning the report is mandatory.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      // 1. Update duty_reports to returned
      const { error: repError } = await supabase
        .from('duty_reports')
        .update({
          status: 'returned',
          correction_reason: correctionReason.trim(),
          manager_reviewed_at: now,
          updated_at: now,
        })
        .eq('id', report.id);

      if (repError) throw new Error(repError.message);

      // 2. Update duty_sessions to returned so officer can address
      await supabase
        .from('duty_sessions')
        .update({
          status: 'returned',
          updated_at: now,
        })
        .eq('id', report.duty_session_id);

      // 3. Send high-priority notification to Officer
      if (report.officer_id) {
        await sendNotification({
          recipientUserId: report.officer_id,
          type: 'report_returned',
          title: 'Report Returned for Correction',
          message: `Station Manager requested correction for ${report.station?.station_name}: "${correctionReason.trim()}"`,
          relatedEntityId: report.id,
          relatedEntityType: 'duty_report',
        });
      }

      onActionComplete();
      onClose();
    } catch (err: any) {
      setErrorMsg(`Failed to return report: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-8 animate-fade-in max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="bg-stone-900 text-white p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Duty Report Review & Sign-Off</h2>
              <p className="text-xs text-stone-400">
                {report.station?.station_name} • Submitted {formatGhanaDateTime(report.officer_submitted_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Operational Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-stone-50 p-4 rounded-2xl border border-stone-200/70 text-xs">
            <div className="flex items-center gap-2.5">
              <User className="w-4 h-4 text-orange-600" />
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Security Officer</span>
                <span className="font-bold text-stone-900">{report.officer?.full_name || 'Officer'}</span>
                <span className="text-stone-500 block text-[11px]">{report.officer?.staff_id || 'SEC-ID'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Building className="w-4 h-4 text-orange-600" />
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold">Station</span>
                <span className="font-bold text-stone-900">{report.station?.station_name}</span>
                <span className="text-stone-500 block text-[11px]">{report.station?.location}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:col-span-2 pt-2 border-t border-stone-200/50">
              <Clock className="w-4 h-4 text-stone-400" />
              <div className="flex items-center justify-between w-full">
                <span>Duty Shift: <strong>{formatGhanaDateTime(report.session?.started_at)}</strong> → <strong>{formatGhanaDateTime(report.officer_submitted_at)}</strong></span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                  {occurrences.length} Occurrences
                </span>
              </div>
            </div>
          </div>

          {/* Logged Occurrences List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Logged Shift Occurrences ({occurrences.length})
            </h3>

            {occurrences.length === 0 ? (
              <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 text-center text-xs text-stone-400">
                No occurrences were recorded for this duty shift.
              </div>
            ) : (
              <div className="space-y-3">
                {occurrences.map((occ, idx) => (
                  <div
                    key={occ.id}
                    className="p-4 bg-white rounded-2xl border border-stone-200 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-stone-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-800 font-bold flex items-center justify-center text-[11px]">
                          {idx + 1}
                        </span>
                        <span>Occurrence #{idx + 1}</span>
                      </span>
                      <span className="text-stone-500 text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" />
                        {formatGhanaTime(occ.occurrence_time)}
                      </span>
                    </div>

                    <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
                      {occ.description}
                    </p>

                    {/* Attached Evidence Media */}
                    {occ.evidence && occ.evidence.length > 0 && (
                      <div className="pt-2 border-t border-stone-100 flex flex-wrap gap-2">
                        {occ.evidence.map((ev) => (
                          <a
                            key={ev.id}
                            href={ev.public_url || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-orange-50 border border-stone-200 hover:border-orange-300 text-xs text-stone-700 hover:text-orange-700 font-medium transition"
                          >
                            {ev.file_type.startsWith('video/') ? (
                              <Video className="w-3.5 h-3.5 text-orange-600" />
                            ) : (
                              <ImageIcon className="w-3.5 h-3.5 text-orange-600" />
                            )}
                            <span className="truncate max-w-[180px]">{ev.file_name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Sections */}
          {activeAction === 'view' && (
            <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
              <button
                type="button"
                id="manager-return-prompt-btn"
                onClick={() => setActiveAction('return')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Return for Correction</span>
              </button>
              <button
                type="button"
                id="manager-approve-prompt-btn"
                onClick={() => setActiveAction('approve')}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm shadow-orange-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve & Finalize Report</span>
              </button>
            </div>
          )}

          {/* APPROVE VIEW */}
          {activeAction === 'approve' && (
            <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-2xl space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-orange-950">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                <span>Manager Sign-off & Final Approval</span>
              </div>
              <p className="text-xs text-stone-600">
                Approving this report will lock it permanently, assign it a finalized state, and notify the Administrator.
              </p>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Manager Sign-Off Comments (Optional)
                </label>
                <textarea
                  rows={3}
                  value={managerComments}
                  onChange={(e) => setManagerComments(e.target.value)}
                  placeholder="e.g., Reviewed and verified by Station Manager. Premises secured according to protocol."
                  className="w-full p-2.5 text-xs rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAction('view')}
                  disabled={submitting}
                  className="px-3 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-approve-report-btn"
                  onClick={handleApproveReport}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Finalizing…</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Confirm Final Approval</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* RETURN FOR CORRECTION VIEW */}
          {activeAction === 'return' && (
            <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-rose-950">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                <span>Return Report for Officer Correction</span>
              </div>
              <p className="text-xs text-rose-800">
                Please provide clear instructions on what needs correction (e.g. missing evidence, incomplete description).
              </p>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Correction Reason (Mandatory) *
                </label>
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Specify exact clarifications or attachments required by the officer..."
                  className="w-full p-2.5 text-xs rounded-xl border border-rose-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAction('view')}
                  disabled={submitting}
                  className="px-3 py-2 text-xs font-medium text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-return-report-btn"
                  onClick={handleReturnForCorrection}
                  disabled={submitting || !correctionReason.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Sending…</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Return to Officer</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
