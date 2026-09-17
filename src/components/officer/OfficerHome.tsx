import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { getSupabase, uploadEvidenceFile } from '../../lib/supabase';
import { DutySession, Occurrence } from '../../types';
import {
  formatGhanaTime,
  formatGhanaShortTime,
  formatGhanaDateTime,
  formatGhanaDate,
  formatSecondsCountdown,
  calculateRemainingSeconds,
  calculateDutyEndTime,
} from '../../utils/timezone';
import {
  ShieldAlert,
  Mic,
  MicOff,
  Image as ImageIcon,
  Video,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  FileCheck,
  X,
  UploadCloud,
  ChevronRight,
  ShieldCheck,
  Building,
} from 'lucide-react';

export const OfficerHome: React.FC = () => {
  const { user, profile, assignedStation, refreshProfile } = useAuth();
  const { sendNotification } = useNotifications();

  const [activeSession, setActiveSession] = useState<DutySession | null>(null);
  const [sessionOccurrences, setSessionOccurrences] = useState<Occurrence[]>([]);
  const [loadingSession, setLoadingSession] = useState(true);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Occurrence form state
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [savingOccurrence, setSavingOccurrence] = useState(false);
  const [occurrenceSuccess, setOccurrenceSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Speech to text state
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  // Final submission state
  const [showFinalSummaryModal, setShowFinalSummaryModal] = useState(false);
  const [submittingFinalReport, setSubmittingFinalReport] = useState(false);
  const [justClosedDuty, setJustClosedDuty] = useState(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch active duty session from Supabase
  const fetchActiveDutySession = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingSession(true);
      const supabase = getSupabase();

      // Find the most recent active or submitted session for this officer
      const { data, error } = await supabase
        .from('duty_sessions')
        .select(`
          *,
          station:stations(*),
          manager:profiles!duty_sessions_manager_id_fkey(*)
        `)
        .eq('officer_id', user.id)
        .in('status', ['active', 'ended', 'submitted', 'returned'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching duty session:', error);
      }

      if (data) {
        setActiveSession(data as DutySession);
        // Fetch occurrences for this session
        const { data: occData } = await supabase
          .from('occurrences')
          .select(`
            *,
            evidence:occurrence_evidence(*)
          `)
          .eq('duty_session_id', data.id)
          .order('occurrence_time', { ascending: true });

        setSessionOccurrences((occData as Occurrence[]) || []);
      } else {
        setActiveSession(null);
        setSessionOccurrences([]);
      }
    } catch (err) {
      console.error('Session load error:', err);
    } finally {
      setLoadingSession(false);
    }
  }, [user]);

  // Initial load and realtime subscription to duty session and occurrences
  useEffect(() => {
    fetchActiveDutySession();

    if (!user) return;
    const supabase = getSupabase();

    const channel = supabase
      .channel(`officer-duty-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duty_sessions',
          filter: `officer_id=eq.${user.id}`,
        },
        () => {
          fetchActiveDutySession();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'occurrences',
          filter: `officer_id=eq.${user.id}`,
        },
        () => {
          fetchActiveDutySession();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchActiveDutySession]);

  // Real-time countdown timer tick
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'active') {
      setRemainingSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = calculateRemainingSeconds(activeSession.expected_end_at);
      setRemainingSeconds(remaining);

      // If duty period reached 0, transition local status to 'ended'
      if (remaining <= 0 && activeSession.status === 'active') {
        setActiveSession((prev) => (prev ? { ...prev, status: 'ended' } : null));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  // Speech Recognition setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setDescription((prev) => {
          const base = prev.trim();
          return base ? `${base} ${currentTranscript}` : currentTranscript;
        });
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Speech recognition start failed:', err);
      }
    }
  };

  // Start Duty Session
  const handleReportOnDuty = async () => {
    if (!user) return;
    if (!assignedStation) {
      setFormError('You do not have an active station assigned. Please contact your Station Manager or Administrator.');
      return;
    }

    setFormError(null);
    setLoadingSession(true);

    try {
      const supabase = getSupabase();
      const now = new Date();
      const expectedEnd = calculateDutyEndTime(now);

      const { data: newSession, error } = await supabase
        .from('duty_sessions')
        .insert({
          officer_id: user.id,
          station_id: assignedStation.id,
          manager_id: assignedStation.manager_id || null,
          duty_date: now.toISOString().split('T')[0],
          started_at: now.toISOString(),
          expected_end_at: expectedEnd.toISOString(),
          status: 'active',
        })
        .select(`
          *,
          station:stations(*),
          manager:profiles!duty_sessions_manager_id_fkey(*)
        `)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setActiveSession(newSession as DutySession);
      setSessionOccurrences([]);
      setJustClosedDuty(false);
    } catch (err: any) {
      setFormError(`Failed to start duty: ${err.message}`);
    } finally {
      setLoadingSession(false);
    }
  };

  // Handle File selection for evidence
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 50MB
    if (file.size > 50 * 1024 * 1024) {
      setFormError('File exceeds maximum limit of 50MB.');
      return;
    }

    // Check valid type (image or video)
    const isValid = file.type.startsWith('image/') || file.type.startsWith('video/');
    if (!isValid) {
      setFormError('Only image (JPG, PNG, WEBP) and video (MP4, MOV) files are supported.');
      return;
    }

    setSelectedFile(file);
    setFilePreviewUrl(URL.createObjectURL(file));
    setFormError(null);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Save Occurrence during active duty
  const handleSaveOccurrence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    if (!description.trim()) {
      setFormError('Please enter an occurrence description.');
      return;
    }

    setSavingOccurrence(true);
    setFormError(null);
    setOccurrenceSuccess(null);

    try {
      const supabase = getSupabase();

      // 1. Insert occurrence record
      const { data: occData, error: occError } = await supabase
        .from('occurrences')
        .insert({
          duty_session_id: activeSession.id,
          officer_id: user!.id,
          station_id: activeSession.station_id,
          manager_id: activeSession.manager_id,
          description: description.trim(),
          occurrence_time: new Date().toISOString(),
          status: 'recorded',
        })
        .select()
        .single();

      if (occError) {
        throw new Error(occError.message);
      }

      // 2. If evidence file is attached, upload to Supabase Storage and create evidence record
      if (selectedFile) {
        try {
          const uploadRes = await uploadEvidenceFile(selectedFile, occData.id, user!.id);
          await supabase.from('occurrence_evidence').insert({
            occurrence_id: occData.id,
            storage_path: uploadRes.storagePath,
            file_name: uploadRes.fileName,
            file_type: uploadRes.fileType,
            file_size: uploadRes.fileSize,
            public_url: uploadRes.publicUrl,
          });
        } catch (uploadErr: any) {
          console.warn('Evidence upload warning:', uploadErr);
          // Don't fail the occurrence save if upload was rejected by storage policies, but inform officer
          setFormError(`Occurrence recorded, but evidence upload failed: ${uploadErr.message}`);
        }
      }

      // 3. Clear form
      setDescription('');
      removeSelectedFile();
      setOccurrenceSuccess('Occurrence successfully recorded in logbook.');
      setTimeout(() => setOccurrenceSuccess(null), 4000);

      // 4. Refresh occurrences
      fetchActiveDutySession();
    } catch (err: any) {
      setFormError(`Failed to save occurrence: ${err.message}`);
    } finally {
      setSavingOccurrence(false);
    }
  };

  // Final Duty Report Submission
  const handleConfirmFinalSubmission = async () => {
    if (!activeSession || !user) return;
    setSubmittingFinalReport(true);
    setFormError(null);

    try {
      const supabase = getSupabase();
      const now = new Date().toISOString();

      // 1. Lock the duty session
      const { error: sessionError } = await supabase
        .from('duty_sessions')
        .update({
          status: 'submitted',
          closed_at: now,
          final_submitted_at: now,
          updated_at: now,
        })
        .eq('id', activeSession.id);

      if (sessionError) throw new Error(sessionError.message);

      // 2. Insert or update the duty_reports entry
      const { error: reportError } = await supabase.from('duty_reports').upsert({
        duty_session_id: activeSession.id,
        officer_id: user.id,
        station_id: activeSession.station_id,
        manager_id: activeSession.manager_id,
        officer_submitted_at: now,
        status: 'submitted',
        updated_at: now,
      });

      if (reportError) throw new Error(reportError.message);

      // 3. Send real-time notification to assigned Station Manager
      if (activeSession.manager_id) {
        await sendNotification({
          recipientUserId: activeSession.manager_id,
          type: 'report_submitted',
          title: 'New Duty Report Submitted',
          message: `Officer ${profile?.full_name || 'Officer'} submitted the final duty report for ${
            activeSession.station?.station_name || 'Station'
          } with ${sessionOccurrences.length} occurrence(s).`,
          relatedEntityId: activeSession.id,
          relatedEntityType: 'duty_report',
        });
      }

      // 4. Close modal and show success closed screen
      setShowFinalSummaryModal(false);
      setJustClosedDuty(true);
      setActiveSession((prev) => (prev ? { ...prev, status: 'submitted', closed_at: now } : null));
    } catch (err: any) {
      setFormError(`Submission failed: ${err.message}`);
    } finally {
      setSubmittingFinalReport(false);
    }
  };

  if (loadingSession) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-medium text-stone-500">Checking authoritative duty state…</p>
      </div>
    );
  }

  // 1. DUTY CLOSED STATE
  if (justClosedDuty || (activeSession && (activeSession.status === 'submitted' || activeSession.status === 'finalized'))) {
    return (
      <div className="max-w-md mx-auto py-6 px-4 space-y-5 animate-fade-in">
        <div className="bg-white rounded-3xl border border-stone-200 p-8 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight mb-2">DUTY CLOSED</h2>
          <p className="text-sm font-medium text-emerald-800 bg-emerald-50/80 py-2 px-4 rounded-full inline-block border border-emerald-200/60 mb-4">
            Duty successfully closed. Thank you for your service. 🙏
          </p>
          <p className="text-xs text-stone-500 leading-relaxed max-w-xs mx-auto">
            Your final duty report for <strong>{activeSession?.station?.station_name || assignedStation?.station_name}</strong> has been forwarded to your Station Manager for review.
          </p>

          <div className="mt-6 pt-6 border-t border-stone-100 flex flex-col gap-2 text-left text-xs text-stone-600">
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-400">Duty Started:</span>
              <span className="font-semibold text-stone-800">{formatGhanaDateTime(activeSession?.started_at)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-stone-50">
              <span className="text-stone-400">Duty Closed:</span>
              <span className="font-semibold text-stone-800">{formatGhanaDateTime(activeSession?.closed_at || activeSession?.final_submitted_at)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-stone-400">Total Occurrences:</span>
              <span className="font-semibold text-stone-800">{sessionOccurrences.length} recorded</span>
            </div>
          </div>

          <button
            onClick={() => {
              setJustClosedDuty(false);
              fetchActiveDutySession();
            }}
            className="mt-6 w-full py-2.5 px-4 rounded-xl border border-stone-300 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
          >
            Start New Shift
          </button>
        </div>
      </div>
    );
  }

  // 2. BEFORE DUTY STATE
  if (!activeSession) {
    return (
      <div className="max-w-md mx-auto py-6 px-4 space-y-5 animate-fade-in">
        {/* Officer & Station Card */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-6 shadow-xs">
          <div className="flex items-center gap-3.5 mb-5 pb-5 border-b border-stone-100">
            <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-bold text-lg shadow-sm shadow-orange-600/20">
              {profile?.full_name?.charAt(0) || 'O'}
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">{profile?.full_name || 'Officer'}</h2>
              <p className="text-xs text-stone-500">Badge ID: {profile?.staff_id || 'SEC-OFFICER'}</p>
            </div>
          </div>

          {assignedStation ? (
            <div className="space-y-3 bg-stone-50/80 rounded-2xl p-4 border border-stone-200/60">
              <div className="flex items-start gap-2.5">
                <Building className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Assigned Station</div>
                  <div className="text-sm font-bold text-stone-900">{assignedStation.station_name}</div>
                  <div className="text-xs text-stone-500">{assignedStation.station_code} • {assignedStation.location}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-stone-200/50 text-xs text-stone-600">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                <span>Standard Shift: <strong>6:00 PM → 6:00 AM</strong> (12 Hours)</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>No Station Assigned</span>
              </div>
              <p>You must be assigned to an active security station by an administrator before reporting on duty.</p>
            </div>
          )}

          {formError && (
            <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Primary Action */}
          <div className="mt-6">
            <button
              id="report-on-duty-btn"
              onClick={handleReportOnDuty}
              disabled={!assignedStation}
              className="w-full py-4 px-6 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-base shadow-md shadow-orange-600/25 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>REPORT ON DUTY</span>
            </button>
            <p className="text-[11px] text-center text-stone-400 mt-2">
              Records authoritative Ghana server timestamp & starts 12-hour duty countdown.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3. ACTIVE DUTY OR DUTY ENDED STATE
  const isShiftEnded = activeSession.status === 'ended' || remainingSeconds <= 0;

  return (
    <div className="max-w-md mx-auto py-5 px-4 space-y-5 animate-fade-in pb-24">
      {/* ON DUTY HEADER & REALTIME COUNTDOWN CARD */}
      <div className={`rounded-3xl border p-5 shadow-xs transition ${
        isShiftEnded
          ? 'bg-amber-50/90 border-amber-300'
          : 'bg-white border-stone-200/90'
      }`}>
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <span className={`flex h-3 w-3 relative ${isShiftEnded ? 'hidden' : 'inline-flex'}`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-600"></span>
            </span>
            <span className={`text-xs font-bold tracking-wider uppercase ${isShiftEnded ? 'text-amber-800' : 'text-orange-600'}`}>
              {isShiftEnded ? 'DUTY PERIOD COMPLETE' : 'ON DUTY'}
            </span>
          </div>
          <span className="text-[11px] font-medium text-stone-500">
            {activeSession.station?.station_code || assignedStation?.station_code}
          </span>
        </div>

        {/* Realtime Countdown */}
        <div className="py-4 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400 mb-1">
            {isShiftEnded ? 'Shift Time Elapsed' : 'Time Remaining'}
          </div>
          <div className="text-4xl font-extrabold tracking-tight text-stone-900 font-mono">
            {formatSecondsCountdown(remainingSeconds)}
          </div>
          <div className="text-xs text-stone-500 mt-1 flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3 text-stone-400" />
            <span>Shift End: <strong>{formatGhanaShortTime(activeSession.expected_end_at)}</strong> (12h)</span>
          </div>
        </div>

        {/* Station Details */}
        <div className="bg-stone-50 rounded-2xl p-3 text-xs text-stone-700 flex items-center justify-between border border-stone-200/60">
          <div className="flex items-center gap-2 truncate">
            <MapPin className="w-4 h-4 text-orange-600 flex-shrink-0" />
            <span className="font-semibold truncate">{activeSession.station?.station_name || assignedStation?.station_name}</span>
          </div>
          <span className="text-[10px] text-stone-500 px-2 py-0.5 rounded-md bg-white border border-stone-200 flex-shrink-0">
            {formatGhanaDate(activeSession.duty_date)}
          </span>
        </div>
      </div>

      {/* SHIFT ENDED BANNER / FINAL REPORT PROMPT */}
      {isShiftEnded && (
        <div className="p-4 rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm">
            <FileCheck className="w-5 h-5" />
            <span>Duty Period Ended — Ready for Final Report</span>
          </div>
          <p className="text-xs text-amber-50 leading-relaxed">
            Your 12-hour operational duty period has concluded. Please review your logged occurrences and submit the final report to your Station Manager.
          </p>
          <button
            id="review-final-report-btn"
            onClick={() => setShowFinalSummaryModal(true)}
            className="w-full py-3 px-4 rounded-xl bg-white text-stone-900 font-bold text-xs hover:bg-stone-100 transition shadow-xs flex items-center justify-center gap-1.5"
          >
            <span>SUBMIT FINAL OCCURRENCE / REPORT</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* RECORD OCCURRENCE FORM (Available during active duty) */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-orange-600" />
            <span>Record Occurrence</span>
          </h3>
          <span className="text-[11px] font-semibold text-stone-400">
            {sessionOccurrences.length} logged
          </span>
        </div>

        {occurrenceSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{occurrenceSuccess}</span>
          </div>
        )}

        {formError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSaveOccurrence} className="space-y-3">
          {/* Description Textarea */}
          <div className="relative">
            <textarea
              id="occurrence-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe observation, routine finding, suspicious activity, equipment issue, or incident..."
              disabled={savingOccurrence || activeSession.status === 'submitted'}
              className="w-full p-3 text-xs rounded-2xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 placeholder:text-stone-400 resize-none leading-relaxed"
            />

            {/* Voice-to-Text Button */}
            {speechSupported && (
              <button
                type="button"
                id="voice-mic-btn"
                onClick={toggleSpeechRecognition}
                className={`absolute bottom-3 right-3 p-2 rounded-xl border transition flex items-center gap-1 text-xs ${
                  isRecording
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : 'bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
                title={isRecording ? 'Stop recording voice' : 'Speak occurrence with voice-to-text'}
              >
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-orange-600" />}
                <span className="text-[10px] font-semibold">{isRecording ? 'Listening…' : 'Voice'}</span>
              </button>
            )}
          </div>

          {/* Evidence Upload Bar */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              className="hidden"
              id="evidence-file-input"
            />

            {!selectedFile ? (
              <button
                type="button"
                id="upload-evidence-btn"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-xl border border-dashed border-stone-300 hover:border-orange-500 bg-stone-50/60 hover:bg-orange-50/30 text-stone-600 hover:text-orange-700 transition text-xs font-medium flex items-center justify-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-orange-600" />
                <span>Upload Evidence (Photo / Video)</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {selectedFile.type.startsWith('image/') ? (
                    filePreviewUrl ? (
                      <img
                        src={filePreviewUrl}
                        alt="Evidence preview"
                        className="w-10 h-10 rounded-lg object-cover border border-stone-200 flex-shrink-0"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-orange-600 flex-shrink-0" />
                    )
                  ) : (
                    <Video className="w-6 h-6 text-orange-600 flex-shrink-0" />
                  )}
                  <div className="truncate">
                    <div className="text-xs font-semibold text-stone-900 truncate">{selectedFile.name}</div>
                    <div className="text-[10px] text-stone-500">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeSelectedFile}
                  className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-stone-100 transition"
                  title="Remove evidence file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button
            type="submit"
            id="save-occurrence-btn"
            disabled={savingOccurrence || !description.trim() || activeSession.status === 'submitted'}
            className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm shadow-orange-600/20 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {savingOccurrence ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving to Supabase…</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Save Occurrence</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* RECENT OCCURRENCES LOGBOOK FOR CURRENT SHIFT */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
            Shift Logbook ({sessionOccurrences.length})
          </h3>
          {!isShiftEnded && sessionOccurrences.length > 0 && (
            <button
              onClick={() => setShowFinalSummaryModal(true)}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              Ready to Close?
            </button>
          )}
        </div>

        {sessionOccurrences.length === 0 ? (
          <div className="p-6 bg-white rounded-2xl border border-stone-200/80 text-center text-xs text-stone-400">
            No occurrences recorded yet for this duty session.
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessionOccurrences.map((occ, idx) => (
              <div
                key={occ.id}
                className="p-3.5 bg-white rounded-2xl border border-stone-200/80 shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-stone-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-orange-50 text-orange-700 font-bold flex items-center justify-center text-[10px]">
                      {idx + 1}
                    </span>
                    <span>Entry #{idx + 1}</span>
                  </span>
                  <span className="text-stone-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatGhanaTime(occ.occurrence_time)}
                  </span>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">{occ.description}</p>
                {occ.evidence && occ.evidence.length > 0 && (
                  <div className="pt-1 flex flex-wrap gap-2">
                    {occ.evidence.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center gap-1.5 px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-[10px] text-stone-600"
                      >
                        {ev.file_type.startsWith('video/') ? (
                          <Video className="w-3 h-3 text-orange-600" />
                        ) : (
                          <ImageIcon className="w-3 h-3 text-orange-600" />
                        )}
                        <span className="truncate max-w-[140px]">{ev.file_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FINAL REPORT SUBMISSION MODAL */}
      {showFinalSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 my-8 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-orange-600" />
                <h3 className="text-base font-bold text-stone-900">Final Duty Report</h3>
              </div>
              <button
                onClick={() => setShowFinalSummaryModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Please confirm your duty report summary before submitting. Submitting will lock this duty session and forward it to Station Manager <strong>{activeSession.manager?.full_name || 'Station Manager'}</strong>.
            </p>

            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Security Officer:</span>
                <span className="font-semibold text-stone-900">{profile?.full_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Station:</span>
                <span className="font-semibold text-stone-900">{activeSession.station?.station_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Duty Started:</span>
                <span className="font-semibold text-stone-900">{formatGhanaDateTime(activeSession.started_at)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-200/50">
                <span className="text-stone-500">Total Occurrences:</span>
                <span className="font-bold text-orange-600">{sessionOccurrences.length} items logged</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-500">Report Status:</span>
                <span className="font-semibold text-amber-700">Ready for Submission</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFinalSummaryModal(false)}
                disabled={submittingFinalReport}
                className="flex-1 py-3 px-4 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition"
              >
                Back to Edit
              </button>
              <button
                type="button"
                id="confirm-submit-report-btn"
                onClick={handleConfirmFinalSubmission}
                disabled={submittingFinalReport}
                className="flex-1 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm flex items-center justify-center gap-1.5"
              >
                {submittingFinalReport ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Locking…</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Confirm & Submit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
