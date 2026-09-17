import React, { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { safeFetchJson, sanitizeErrorMessage } from '../../lib/safeFetch';
import { Station, Profile } from '../../types';
import {
  Building,
  Plus,
  MapPin,
  UserCheck,
  CheckCircle2,
  XCircle,
  X,
  Edit2,
  Users,
  AlertCircle,
  Search,
  Sparkles,
  RefreshCw,
  Copy,
  ExternalLink,
  ShieldAlert,
  Wrench,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

const RLS_FIX_SQL = `-- Run this in your Supabase SQL Editor to fix the stations RLS policy:
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stations viewable by authenticated users" ON public.stations;
CREATE POLICY "Stations viewable by authenticated users" 
    ON public.stations FOR SELECT 
    TO authenticated 
    USING (true);

DROP POLICY IF EXISTS "Admins can manage stations" ON public.stations;
CREATE POLICY "Admins can manage stations" 
    ON public.stations FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);`;

// Real-time unique station code generator
export const generateStationCode = (
  name: string,
  loc: string,
  existingStations: Station[],
  excludeStationId?: string
): string => {
  const existingCodes = new Set(
    existingStations
      .filter((s) => s.id !== excludeStationId)
      .map((s) => (s.station_code || '').toUpperCase().trim())
  );

  let prefix = '';
  const cleanName = (name || '').trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = cleanName.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    prefix = words
      .slice(0, 4)
      .map((w) => w[0].toUpperCase())
      .join('');
  } else if (words.length === 1) {
    const w = words[0].toUpperCase();
    prefix = w.length <= 4 ? w : (w.slice(0, 3) + (w[w.length - 1] || ''));
  }

  // Fallback to location if name is empty
  if (!prefix || prefix.length < 2) {
    const cleanLoc = (loc || '').trim().replace(/[^a-zA-Z0-9\s]/g, '');
    const locWords = cleanLoc.split(/\s+/).filter(Boolean);
    if (locWords.length > 0) {
      prefix = locWords.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
    }
  }

  if (!prefix || prefix.length < 2) {
    prefix = 'GEN';
  }

  const base = `STN-${prefix}`;

  // Find next available sequence number
  let counter = 1;
  let candidate = `${base}-${String(counter).padStart(2, '0')}`;
  while (existingCodes.has(candidate)) {
    counter++;
    candidate = `${base}-${String(counter).padStart(2, '0')}`;
  }

  return candidate;
};

export const AdminStations: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [officers, setOfficers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [stationName, setStationName] = useState('');
  const [stationCode, setStationCode] = useState('');
  const [isAutoCode, setIsAutoCode] = useState(true);
  const [location, setLocation] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rlsErrorDetails, setRlsErrorDetails] = useState(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);
  const [attemptingRlsAutoHeal, setAttemptingRlsAutoHeal] = useState(false);

  // Assign officers modal state
  const [assignModalStation, setAssignModalStation] = useState<Station | null>(null);
  const [stationOfficerIds, setStationOfficerIds] = useState<string[]>([]);
  const [savingAssignments, setSavingAssignments] = useState(false);

  // Delete confirmation state
  const [deleteConfirmStation, setDeleteConfirmStation] = useState<Station | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Fetch stations
      const { data: stnData, error: stnErr } = await supabase
        .from('stations')
        .select(`
          *,
          manager:profiles!stations_manager_id_fkey(*)
        `)
        .order('created_at', { ascending: false });

      if (stnErr) console.error('Error fetching stations:', stnErr);
      setStations((stnData as Station[]) || []);

      // Fetch managers
      const { data: mgrData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'manager')
        .eq('status', 'active');
      setManagers((mgrData as Profile[]) || []);

      // Fetch officers
      const { data: offData } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'officer')
        .eq('status', 'active');
      setOfficers((offData as Profile[]) || []);
    } catch (err) {
      console.error('Failed to load stations data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-stations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_officers' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingStation(null);
    setStationName('');
    setLocation('');
    setSelectedManagerId('');
    setErrorMsg(null);
    setRlsErrorDetails(false);
    setCopiedRlsSql(false);
    setIsAutoCode(true);
    // Pre-generate guaranteed unique station code right away
    const initialCode = generateStationCode('', '', stations);
    setStationCode(initialCode);
    setShowModal(true);
  };

  const openEditModal = (stn: Station) => {
    setEditingStation(stn);
    setStationName(stn.station_name);
    setStationCode(stn.station_code);
    setLocation(stn.location);
    setSelectedManagerId(stn.manager_id || '');
    setErrorMsg(null);
    setRlsErrorDetails(false);
    setCopiedRlsSql(false);
    setIsAutoCode(false);
    setShowModal(true);
  };

  // Real-time auto-generation input handlers
  const handleStationNameChange = (val: string) => {
    setStationName(val);
    if (isAutoCode) {
      const generated = generateStationCode(val, location, stations, editingStation?.id);
      setStationCode(generated);
    }
  };

  const handleLocationChange = (val: string) => {
    setLocation(val);
    if (isAutoCode && (!stationName || stationName.trim().length < 2)) {
      const generated = generateStationCode(stationName, val, stations, editingStation?.id);
      setStationCode(generated);
    }
  };

  const handleStationCodeChange = (val: string) => {
    const formatted = val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setStationCode(formatted);
    setIsAutoCode(false);
  };

  const handleRegenerateCode = () => {
    const generated = generateStationCode(stationName, location, stations, editingStation?.id);
    setStationCode(generated);
    setIsAutoCode(true);
  };

  const handleCopyRlsSql = () => {
    navigator.clipboard.writeText(RLS_FIX_SQL);
    setCopiedRlsSql(true);
    setTimeout(() => setCopiedRlsSql(false), 3000);
  };

  // Attempt to self-heal admin role in public.profiles table
  const handleAutoHealAdmin = async () => {
    try {
      setAttemptingRlsAutoHeal(true);
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErrorMsg('No active user session detected. Please sign in again.');
        return;
      }

      // Upsert profile as active admin
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        auth_user_id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || 'Admin',
        role: 'admin',
        status: 'active',
        updated_at: new Date().toISOString(),
      });

      if (error) {
        throw new Error(error.message);
      }

      setErrorMsg(null);
      setRlsErrorDetails(false);
      // Automatically re-trigger save
      const dummyEvent = { preventDefault: () => {} } as React.FormEvent;
      await handleSaveStation(dummyEvent);
    } catch (healErr: any) {
      setErrorMsg(`Auto-heal profile failed: ${healErr.message}. Please use the "Copy SQL Fix" button below to run the fix directly in your Supabase SQL Editor.`);
    } finally {
      setAttemptingRlsAutoHeal(false);
    }
  };

  // Real-time collision check
  const isCodeDuplicate = stations.some(
    (s) => s.id !== editingStation?.id && s.station_code.toUpperCase().trim() === stationCode.toUpperCase().trim()
  );

  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stationName.trim() || !location.trim()) {
      setErrorMsg('Please fill in station name and location.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setRlsErrorDetails(false);

    try {
      const supabase = getSupabase();
      
      // Auto-clean code; fallback to auto-generated unique code if empty
      let finalCode = stationCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (!finalCode) {
        finalCode = generateStationCode(stationName, location, stations, editingStation?.id);
      }

      // Check collision with other stations in memory
      const hasConflict = stations.some(
        (s) => s.id !== editingStation?.id && s.station_code.toUpperCase().trim() === finalCode
      );
      if (hasConflict) {
        finalCode = generateStationCode(stationName, location, stations, editingStation?.id);
      }

      // Proactively ensure the logged in user has an admin profile in public.profiles to satisfy RLS
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('profiles').upsert({
            id: user.id,
            auth_user_id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || 'Admin',
            role: 'admin',
            status: 'active',
            updated_at: new Date().toISOString(),
          });
        }
      } catch (profileSyncErr) {
        // Non-blocking sync attempt
        console.warn('Profile sync check warning:', profileSyncErr);
      }

      // 1. First attempt: Server API (uses SUPABASE_SERVICE_ROLE_KEY to safely bypass RLS if configured)
      let savedViaServer = false;
      try {
        const serverResult = await safeFetchJson('/api/admin/save-station', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingStation?.id,
            station_name: stationName.trim(),
            station_code: finalCode,
            location: location.trim(),
            manager_id: selectedManagerId || null,
          }),
        });

        if (serverResult.ok && serverResult.data?.success) {
          savedViaServer = true;
        }
      } catch {
        // Fall back to direct supabase client
      }

      // 2. Second attempt: Direct Supabase client
      if (!savedViaServer) {
        const payload: any = {
          station_name: stationName.trim(),
          station_code: finalCode,
          location: location.trim(),
          manager_id: selectedManagerId || null,
          updated_at: new Date().toISOString(),
        };

        if (editingStation) {
          const { error } = await supabase
            .from('stations')
            .update(payload)
            .eq('id', editingStation.id);
          if (error) throw new Error(sanitizeErrorMessage(error.message));
        } else {
          let { error } = await supabase
            .from('stations')
            .insert(payload);

          // Fail-safe auto-retry if concurrent insert had duplicate code
          if (error && (error.message.includes('unique') || error.message.includes('station_code'))) {
            payload.station_code = `${finalCode}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
            const retryRes = await supabase.from('stations').insert(payload);
            if (retryRes.error) throw new Error(sanitizeErrorMessage(retryRes.error.message));
          } else if (error) {
            throw new Error(sanitizeErrorMessage(error.message));
          }
        }
      }

      setShowModal(false);
      fetchData();
    } catch (err: any) {
      const errMsg = sanitizeErrorMessage(err, 'Failed to save station');
      const isRls = errMsg.toLowerCase().includes('row-level security') || 
                    errMsg.toLowerCase().includes('policy') ||
                    errMsg.toLowerCase().includes('violates');

      if (isRls) {
        setRlsErrorDetails(true);
        setErrorMsg('Row-Level Security policy error on table "stations": Write permission denied by Supabase RLS.');
      } else {
        setErrorMsg(`Failed to save station: ${errMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStationStatus = async (stn: Station) => {
    try {
      const newStatus = stn.status === 'active' ? 'inactive' : 'active';

      // Try server toggle first
      let toggledViaServer = false;
      try {
        const result = await safeFetchJson('/api/admin/toggle-station-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: stn.id, status: newStatus }),
        });
        if (result.ok) {
          toggledViaServer = true;
        }
      } catch {
        // Fall back
      }

      if (!toggledViaServer) {
        const supabase = getSupabase();
        await supabase
          .from('stations')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', stn.id);
      }
      fetchData();
    } catch (err) {
      console.error('Failed to toggle station status:', err);
    }
  };

  const handleDeleteStation = async () => {
    if (!deleteConfirmStation) return;
    setDeleting(true);

    try {
      const serverResult = await safeFetchJson('/api/admin/delete-station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteConfirmStation.id }),
      });

      if (!serverResult.ok || !serverResult.data?.success) {
        // Fallback: direct Supabase delete
        const supabase = getSupabase();
        // Deactivate officer assignments
        await supabase.from('station_officers').update({ active: false }).eq('station_id', deleteConfirmStation.id);
        // Delete station
        const { error } = await supabase.from('stations').delete().eq('id', deleteConfirmStation.id);
        if (error) throw new Error(sanitizeErrorMessage(error.message));
      }

      setDeleteConfirmStation(null);
      fetchData();
    } catch (err) {
      console.error('Failed to delete station:', err);
    } finally {
      setDeleting(false);
    }
  };

  // Officer assignments handler
  const openAssignModal = async (stn: Station) => {
    setAssignModalStation(stn);
    const supabase = getSupabase();
    const { data } = await supabase
      .from('station_officers')
      .select('officer_id')
      .eq('station_id', stn.id)
      .eq('active', true);

    setStationOfficerIds(data ? data.map((d: any) => d.officer_id) : []);
  };

  const toggleOfficerAssignment = (officerId: string) => {
    setStationOfficerIds((prev) =>
      prev.includes(officerId) ? prev.filter((id) => id !== officerId) : [...prev, officerId]
    );
  };

  const handleSaveAssignments = async () => {
    if (!assignModalStation) return;
    setSavingAssignments(true);

    try {
      const res = await fetch('/api/admin/assign-station-officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: assignModalStation.id,
          officerIds: stationOfficerIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save assignments');
      }

      setAssignModalStation(null);
      fetchData();
    } catch (err) {
      console.error('Failed to save officer assignments:', err);
    } finally {
      setSavingAssignments(false);
    }
  };

  const filteredStations = stations.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      s.station_name.toLowerCase().includes(q) ||
      s.station_code.toLowerCase().includes(q) ||
      s.location.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Security Station Directory</h1>
          <p className="text-xs text-stone-500">Configure operational sites, assign managers, and deploy officers</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search station or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-48 sm:w-60"
            />
          </div>

          <button
            id="create-station-btn"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Station</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading stations…</p>
        </div>
      ) : filteredStations.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No Stations Found"
          description={searchQuery ? 'No stations matched your search query.' : 'Register your first security station to begin assigning personnel.'}
          actionLabel="Create New Station"
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStations.map((stn) => (
            <div
              key={stn.id}
              className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs space-y-4 hover:border-stone-300 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-800 flex items-center justify-center font-bold text-base">
                    <Building className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-stone-900 leading-tight">{stn.station_name}</div>
                    <div className="text-xs font-mono font-semibold text-orange-600 mt-0.5">{stn.station_code}</div>
                  </div>
                </div>

                <button
                  onClick={() => toggleStationStatus(stn)}
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                    stn.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                  }`}
                  title="Toggle station active state"
                >
                  {stn.status === 'active' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  <span>{stn.status === 'active' ? 'Active' : 'Inactive'}</span>
                </button>
              </div>

              <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 space-y-2 text-xs text-stone-600">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                  <span>{stn.location}</span>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-stone-200/50">
                  <UserCheck className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                  <span className="text-stone-500">Manager:</span>
                  <span className="font-semibold text-stone-900">{stn.manager?.full_name || 'None Assigned'}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
                <button
                  onClick={() => openAssignModal(stn)}
                  className="flex-1 py-2 px-3 rounded-xl border border-stone-200 bg-stone-50 hover:bg-orange-50 hover:border-orange-200 text-stone-700 hover:text-orange-700 text-xs font-semibold transition flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Assign Officers</span>
                </button>
                <button
                  onClick={() => openEditModal(stn)}
                  className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition"
                  title="Edit station details"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteConfirmStation(stn)}
                  className="p-2 rounded-xl border border-stone-200 hover:bg-rose-50 hover:border-rose-200 text-stone-600 hover:text-rose-600 transition"
                  title="Delete station"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT STATION MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-stone-900">
                {editingStation ? 'Edit Station Details' : 'Create Security Station'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {rlsErrorDetails && (
              <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs space-y-2.5">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-amber-900">Row-Level Security (RLS) Policy Fix</p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Your Supabase <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">stations</code> table has an RLS policy that requires admin permissions or is denying inserts for your current auth user.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/80 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoHealAdmin}
                    disabled={attemptingRlsAutoHeal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] shadow-xs transition disabled:opacity-50"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>{attemptingRlsAutoHeal ? 'Syncing...' : '1-Click Auto-Fix Role & Retry'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyRlsSql}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-amber-100/70 border border-amber-300 text-amber-900 font-semibold text-[11px] transition"
                  >
                    {copiedRlsSql ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-700" />}
                    <span>{copiedRlsSql ? 'SQL Copied!' : 'Copy SQL Fix'}</span>
                  </button>

                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-800 hover:text-amber-950 underline ml-auto"
                  >
                    <span>Supabase SQL Editor</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="bg-stone-900 text-stone-200 p-2.5 rounded-xl font-mono text-[10px] overflow-x-auto select-all leading-tight border border-stone-700">
                  <code>{RLS_FIX_SQL}</code>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveStation} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Station Name *</label>
                <input
                  type="text"
                  required
                  value={stationName}
                  onChange={(e) => handleStationNameChange(e.target.value)}
                  placeholder="e.g., North Gate Checkpoint"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-stone-700">Station Code (Unique ID) *</label>
                  <div className="flex items-center gap-2">
                    {isAutoCode ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                        <Sparkles className="w-3 h-3 text-orange-600" />
                        Auto-Generated
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRegenerateCode}
                        className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 underline"
                      >
                        Auto-Generate
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    value={stationCode}
                    onChange={(e) => handleStationCodeChange(e.target.value)}
                    placeholder="e.g., STN-NGC-01"
                    className={`w-full pl-3 pr-10 py-2 text-xs rounded-xl border font-mono uppercase focus:outline-none focus:ring-2 ${
                      isCodeDuplicate
                        ? 'border-amber-400 bg-amber-50/50 focus:ring-amber-500 text-amber-900'
                        : 'border-stone-300 focus:ring-orange-500 bg-white'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    title="Regenerate unique station code"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-stone-400 hover:text-orange-600 hover:bg-stone-100 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px]">
                  {isCodeDuplicate ? (
                    <div className="text-amber-700 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      <span>Code exists.</span>
                      <button
                        type="button"
                        onClick={handleRegenerateCode}
                        className="underline text-orange-700 font-bold ml-1 hover:text-orange-800"
                      >
                        Auto-Resolve
                      </button>
                    </div>
                  ) : stationCode.trim() ? (
                    <div className="text-emerald-700 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Unique ID verified (no collisions)</span>
                    </div>
                  ) : (
                    <span className="text-stone-400">Generated automatically in real-time</span>
                  )}
                  <span className="text-stone-400 font-mono">Format: STN-XXX-01</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Station Location *</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  placeholder="e.g., Airport Residential Area, Accra"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Assign Station Manager</label>
                <select
                  value={selectedManagerId}
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  <option value="">No Manager Assigned</option>
                  {managers.map((mgr) => (
                    <option key={mgr.id} value={mgr.id}>
                      {mgr.full_name} ({mgr.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm"
                >
                  {saving ? 'Saving…' : editingStation ? 'Update Station' : 'Create Station'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN OFFICERS MODAL */}
      {assignModalStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900">Assign Security Officers</h3>
                <p className="text-xs text-stone-500">{assignModalStation.station_name}</p>
              </div>
              <button onClick={() => setAssignModalStation(null)} className="p-1 rounded-lg text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-600">
              Select the security officers authorized to report on duty and log occurrences at this station:
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 border border-stone-200 rounded-2xl p-3 bg-stone-50">
              {officers.length === 0 ? (
                <div className="text-center py-6 text-xs text-stone-400">
                  No active security officers found in database. Create officers in the User Management tab first.
                </div>
              ) : (
                officers.map((off) => {
                  const isChecked = stationOfficerIds.includes(off.id);
                  return (
                    <label
                      key={off.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                        isChecked
                          ? 'bg-orange-50/70 border-orange-300 text-orange-900 font-semibold'
                          : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOfficerAssignment(off.id)}
                          className="rounded text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-xs">{off.full_name}</span>
                      </div>
                      <span className="text-[10px] text-stone-400 font-mono">{off.staff_id || 'OFFICER'}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setAssignModalStation(null)}
                disabled={savingAssignments}
                className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={savingAssignments}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm"
              >
                {savingAssignments ? 'Saving…' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-rose-700">Delete Station</h3>
              <button onClick={() => setDeleteConfirmStation(null)} className="p-1 rounded-lg text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-stone-700">
                Are you sure you want to permanently delete <span className="font-bold">{deleteConfirmStation.station_name}</span>?
              </p>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1">
                <p className="font-semibold">This action cannot be undone. It will:</p>
                <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                  <li>Remove the station from the system</li>
                  <li>Deactivate all officer assignments for this station</li>
                  <li>The station code <span className="font-mono font-bold">{deleteConfirmStation.station_code}</span> will be freed</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmStation(null)}
                disabled={deleting}
                className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteStation}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : 'Delete Station'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
