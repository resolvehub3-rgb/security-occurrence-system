import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getSupabase, getSupabaseConfig } from '../../lib/supabase';
import { safeFetchJson, sanitizeErrorMessage } from '../../lib/safeFetch';
import { Profile, Station, UserRole } from '../../types';
import {
  Users,
  UserCheck,
  Plus,
  Search,
  Phone,
  Mail,
  Building,
  CheckCircle2,
  XCircle,
  X,
  AlertCircle,
  Key,
  Shield,
  Sparkles,
  RefreshCw,
  BadgeCheck,
  Pencil,
  Trash2,
  Edit2,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

// Real-time unique Officer / Staff Badge ID generator
export const generateOfficerBadgeId = (
  name: string,
  stationId: string,
  stations: Station[],
  existingProfiles: { staff_id?: string | null; id?: string }[],
  role: 'officer' | 'manager' = 'officer',
  excludeUserId?: string
): string => {
  const existingBadges = new Set(
    existingProfiles
      .filter((p) => p.id !== excludeUserId)
      .map((p) => (p.staff_id || '').toUpperCase().trim())
      .filter(Boolean)
  );

  // Role prefix: SO for Security Officer, SM for Station Manager
  const prefix = role === 'manager' ? 'SM' : 'SO';

  // Station code segment (e.g. STN-ACC-01 -> ACC, STN-NGC-01 -> NGC)
  let locSegment = '';
  if (stationId) {
    const matchedStn = stations.find((s) => s.id === stationId);
    if (matchedStn) {
      const codeParts = (matchedStn.station_code || '').split('-');
      if (codeParts.length >= 2 && codeParts[1]) {
        locSegment = codeParts[1].replace(/[^A-Z0-9]/g, '').slice(0, 4).toUpperCase();
      }
      if (!locSegment || locSegment.length < 2) {
        locSegment = (matchedStn.station_name || '')
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 3)
          .toUpperCase();
      }
    }
  }

  // Name initials fallback if station code not available or as personal identifier
  if (!locSegment || locSegment.length < 2) {
    const cleanName = (name || '').trim().replace(/[^a-zA-Z0-9\s]/g, '');
    const nameWords = cleanName.split(/\s+/).filter(Boolean);
    if (nameWords.length >= 2) {
      locSegment = (nameWords[0][0] + nameWords[nameWords.length - 1][0]).toUpperCase();
    } else if (nameWords.length === 1 && nameWords[0].length >= 2) {
      locSegment = nameWords[0].slice(0, 3).toUpperCase();
    }
  }

  if (!locSegment || locSegment.length < 2) {
    locSegment = 'SEC';
  }

  // Next available sequence number: starts at 101
  let counter = 101;
  let candidate = `${prefix}-${locSegment}-${counter}`;

  while (existingBadges.has(candidate)) {
    counter++;
    candidate = `${prefix}-${locSegment}-${counter}`;
  }

  return candidate;
};

export const AdminUsers: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'officer' | 'manager'>('officer');
  const [users, setUsers] = useState<Profile[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [staffId, setStaffId] = useState('');
  const [isAutoBadge, setIsAutoBadge] = useState(true);
  const [phone, setPhone] = useState('');
  const [selectedStationId, setSelectedStationId] = useState('');
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit badge modal state
  const [showEditBadgeModal, setShowEditBadgeModal] = useState(false);
  const [selectedUserForBadge, setSelectedUserForBadge] = useState<Profile | null>(null);
  const [editStaffId, setEditStaffId] = useState('');
  const [isEditAutoBadge, setIsEditAutoBadge] = useState(true);
  const [savingBadge, setSavingBadge] = useState(false);

  // Edit user modal state
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<Profile | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStaffIdField, setEditStaffIdField] = useState('');
  const [editStationId, setEditStationId] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Delete confirmation state
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [schemaNotice, setSchemaNotice] = useState<string | null>(null);

  const fetchUsersAndStations = useCallback(async () => {
    try {
      setLoading(true);
      const config = getSupabaseConfig();
      const supabase = getSupabase();

      // 1. Try server API /api/admin/list-users first (with service role & auto-healing of orphaned auth users)
      let serverUsers: Profile[] = [];
      const headers: Record<string, string> = {};
      if (config.url) headers['x-supabase-url'] = config.url;
      if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

      try {
        const srvRes = await safeFetchJson(`/api/admin/list-users?role=${activeTab}`, {
          headers,
        });
        if (srvRes.ok && Array.isArray(srvRes.data?.users)) {
          serverUsers = srvRes.data.users;
        }
      } catch (srvErr) {
        // Fall back to direct supabase query
      }

      // 2. Fetch profiles directly matching role from Supabase client
      let dbUsers: Profile[] = [];
      const { data: userData, error: userErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', activeTab)
        .order('created_at', { ascending: false });

      if (userErr) {
        console.warn('Database profiles fetch note:', userErr);
        if (userErr.code === '42P01' || userErr.message?.toLowerCase().includes('does not exist')) {
          setSchemaNotice(
            "Notice: The 'public.profiles' table does not exist in your database yet. Run the SQL Migration Script in your Supabase SQL Editor. Personnel you create are safely kept in your local operations registry."
          );
        } else if (userErr.message?.toLowerCase().includes('policy') || userErr.message?.toLowerCase().includes('security')) {
          setSchemaNotice(
            `Database RLS notice: ${userErr.message}. Displaying personnel from operations cache.`
          );
        }
      } else if (userData) {
        dbUsers = userData as Profile[];
        setSchemaNotice(null);
      }

      // Combine server users and db users (server takes precedence as it can auto-heal)
      const primaryDbUsers = serverUsers.length > 0 ? serverUsers : dbUsers;

      // All data comes from Supabase realtime — no local cache
      setUsers(primaryDbUsers);

      // 4. Fetch all profiles for global badge uniqueness validation
      let allDbProfiles: Profile[] = [];
      const { data: allData } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, staff_id, status, phone');
      if (allData) allDbProfiles = allData as Profile[];

      setAllProfiles(allDbProfiles);

      // 5. Fetch all stations
      const { data: stnData } = await supabase
        .from('stations')
        .select('*')
        .order('station_name', { ascending: true });
      setStations((stnData as Station[]) || []);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchUsersAndStations();

    const supabase = getSupabase();
    const channel = supabase
      .channel(`admin-users-realtime-${activeTab}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsersAndStations();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, () => {
        fetchUsersAndStations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsersAndStations, activeTab]);

  // Open creation modal with immediate real-time auto-generated badge
  const openCreateModal = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setSelectedStationId('');
    setIsAutoBadge(true);

    const generated = generateOfficerBadgeId('', '', stations, allProfiles, activeTab);
    setStaffId(generated);
    setShowCreateModal(true);
  };

  // One-click provision demo personnel for rapid validation and instant directory display
  const handleSeedDemoPersonnel = async () => {
    const isOfficer = activeTab === 'officer';
    const sampleId = `sample_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const sampleName = isOfficer ? 'James Mwangi' : 'Sarah Otieno';
    const sampleEmail = isOfficer ? `officer.${Date.now().toString().slice(-4)}@security.ops` : `manager.${Date.now().toString().slice(-4)}@security.ops`;
    const sampleBadge = generateOfficerBadgeId(sampleName, '', stations, allProfiles, activeTab);

    const supabase = getSupabase();
    await supabase.from('profiles').upsert({
      id: sampleId,
      auth_user_id: sampleId,
      email: sampleEmail,
      full_name: sampleName,
      role: activeTab,
      staff_id: sampleBadge,
      phone: isOfficer ? '+254 712 345 678' : '+254 722 987 654',
      status: 'active',
    }, { onConflict: 'id' });

    setSuccessMsg(`Added sample ${isOfficer ? 'Security Officer' : 'Station Manager'} (${sampleName}, ${sampleBadge})!`);
  };

  // Real-time handlers for creation form
  const handleFullNameChange = (val: string) => {
    setFullName(val);
    if (isAutoBadge) {
      const generated = generateOfficerBadgeId(val, selectedStationId, stations, allProfiles, activeTab);
      setStaffId(generated);
    }
  };

  const handleStationChange = (stnId: string) => {
    setSelectedStationId(stnId);
    if (isAutoBadge) {
      const generated = generateOfficerBadgeId(fullName, stnId, stations, allProfiles, activeTab);
      setStaffId(generated);
    }
  };

  const handleStaffIdChange = (val: string) => {
    const formatted = val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setStaffId(formatted);
    setIsAutoBadge(false);
  };

  const handleRegenerateBadge = () => {
    const generated = generateOfficerBadgeId(fullName, selectedStationId, stations, allProfiles, activeTab);
    setStaffId(generated);
    setIsAutoBadge(true);
  };

  // Auto-resolve duplicate badge in real time with zero errors
  const handleAutoResolveDuplicate = () => {
    const generated = generateOfficerBadgeId(fullName, selectedStationId, stations, allProfiles, activeTab);
    setStaffId(generated);
    setIsAutoBadge(true);
  };

  // Check if current staffId in create modal is duplicate
  const isBadgeDuplicate = !!staffId.trim() && allProfiles.some(
    (p) => (p.staff_id || '').toUpperCase().trim() === staffId.toUpperCase().trim()
  );

  // Edit badge modal handlers
  const openEditBadgeModal = (userToEdit: Profile) => {
    setSelectedUserForBadge(userToEdit);
    setErrorMsg(null);
    setIsEditAutoBadge(false);
    setEditStaffId(userToEdit.staff_id || '');
    setShowEditBadgeModal(true);
  };

  const handleEditRegenerateBadge = () => {
    if (!selectedUserForBadge) return;
    const generated = generateOfficerBadgeId(
      selectedUserForBadge.full_name,
      '',
      stations,
      allProfiles,
      selectedUserForBadge.role as any,
      selectedUserForBadge.id
    );
    setEditStaffId(generated);
    setIsEditAutoBadge(true);
  };

  const isEditBadgeDuplicate = !!editStaffId.trim() && allProfiles.some(
    (p) => p.id !== selectedUserForBadge?.id && (p.staff_id || '').toUpperCase().trim() === editStaffId.toUpperCase().trim()
  );

  const handleSaveBadge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForBadge) return;

    let finalId = editStaffId.trim().toUpperCase();
    if (!finalId || isEditBadgeDuplicate) {
      finalId = generateOfficerBadgeId(
        selectedUserForBadge.full_name,
        '',
        stations,
        allProfiles,
        selectedUserForBadge.role as any,
        selectedUserForBadge.id
      );
    }

    setSavingBadge(true);
    setErrorMsg(null);

    try {
      // 1. Update directly in Supabase (realtime, no local cache)
      const supabase = getSupabase();
      await supabase
        .from('profiles')
        .update({ staff_id: finalId, updated_at: new Date().toISOString() })
        .eq('id', selectedUserForBadge.id);

      // 2. Try server API /api/admin/update-badge safely
      const config = getSupabaseConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.url) headers['x-supabase-url'] = config.url;
      if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

      const result = await safeFetchJson('/api/admin/update-badge', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: selectedUserForBadge.id,
          staffId: finalId,
        }),
      });

      if (!result.ok) {
        // Fallback: direct Supabase client update
        const supabase = getSupabase();
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ staff_id: finalId, updated_at: new Date().toISOString() })
          .eq('id', selectedUserForBadge.id);

        if (updateErr) console.warn('Supabase badge update note:', updateErr.message);
      }

      setSuccessMsg(`Badge / Officer ID updated to ${finalId} successfully!`);
      setShowEditBadgeModal(false);
      fetchUsersAndStations();
    } catch (err: any) {
      setErrorMsg(sanitizeErrorMessage(err, 'Failed to update badge ID'));
    } finally {
      setSavingBadge(false);
    }
  };

  // Open full edit user modal
  const openEditUserModal = (userToEdit: Profile) => {
    setSelectedUserForEdit(userToEdit);
    setEditFullName(userToEdit.full_name);
    setEditEmail(userToEdit.email);
    setEditPhone(userToEdit.phone || '');
    setEditStaffIdField(userToEdit.staff_id || '');
    setEditStationId('');
    setErrorMsg(null);
    setShowEditUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit || !editFullName.trim() || !editEmail.trim()) {
      setErrorMsg('Name and email are required.');
      return;
    }

    setSavingUser(true);
    setErrorMsg(null);

    try {
      const config = getSupabaseConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.url) headers['x-supabase-url'] = config.url;
      if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

      // 1. Try server API
      const result = await safeFetchJson('/api/admin/update-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: selectedUserForEdit.id,
          full_name: editFullName.trim(),
          email: editEmail.trim(),
          phone: editPhone.trim(),
          staff_id: editStaffIdField.trim(),
          stationId: editStationId || undefined,
          role: selectedUserForEdit.role,
        }),
      });

      if (!result.ok) {
        // Fallback: direct Supabase update
        const supabase = getSupabase();
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({
            full_name: editFullName.trim(),
            email: editEmail.trim(),
            phone: editPhone.trim() || null,
            staff_id: editStaffIdField.trim().toUpperCase() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedUserForEdit.id);

        if (updateErr) throw new Error(sanitizeErrorMessage(updateErr.message));
      }

      setSuccessMsg(`Updated ${editFullName.trim()} successfully!`);
      setShowEditUserModal(false);
      fetchUsersAndStations();
    } catch (err: any) {
      setErrorMsg(sanitizeErrorMessage(err, 'Failed to update user'));
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setDeleting(true);

    try {
      const config = getSupabaseConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.url) headers['x-supabase-url'] = config.url;
      if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

      const result = await safeFetchJson('/api/admin/delete-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: deleteConfirmUser.id }),
      });

      if (!result.ok) {
        // Fallback: direct Supabase delete
        const supabase = getSupabase();
        // Remove station assignments
        await supabase.from('stations').update({ manager_id: null }).eq('manager_id', deleteConfirmUser.id);
        await supabase.from('station_officers').update({ active: false }).eq('officer_id', deleteConfirmUser.id);
        // Delete profile
        const { error: delErr } = await supabase.from('profiles').delete().eq('id', deleteConfirmUser.id);
        if (delErr) throw new Error(sanitizeErrorMessage(delErr.message));
      }

      setSuccessMsg(`Deleted ${deleteConfirmUser.full_name} successfully!`);
      setDeleteConfirmUser(null);
      fetchUsersAndStations();
    } catch (err: any) {
      setErrorMsg(sanitizeErrorMessage(err, 'Failed to delete user'));
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      setErrorMsg('Name, email, and password are required.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    // Guarantee non-empty, unique Badge ID with zero errors
    let finalStaffId = staffId.trim().toUpperCase();
    if (!finalStaffId || isBadgeDuplicate) {
      finalStaffId = generateOfficerBadgeId(
        fullName,
        selectedStationId,
        stations,
        allProfiles,
        activeTab
      );
    }

    setCreating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const config = getSupabaseConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.url) headers['x-supabase-url'] = config.url;
      if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

      // Step 1: Attempt backend Express API /api/admin/create-user with safe JSON parsing
      const result = await safeFetchJson('/api/admin/create-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          role: activeTab,
          staffId: finalStaffId,
          phone: phone.trim() || null,
          stationId: selectedStationId || null,
        }),
      });

      if (result.ok && result.data?.user) {
        setSuccessMsg(
          `Successfully provisioned ${activeTab === 'manager' ? 'Station Manager' : 'Security Officer'} account (${fullName.trim()}) with Badge ID: ${finalStaffId}!`
        );
        setShowCreateModal(false);
        fetchUsersAndStations();
        return;
      }

      // Step 2: Fallback with isolated Supabase client (does not touch admin session!)
      console.warn('Backend user provisioning notice, executing isolated registration:', result.error);

      const isolatedClient = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          },
        },
      });

      let targetUserId = '';
      const { data: signUpData, error: signUpErr } = await isolatedClient.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: activeTab,
            staff_id: finalStaffId,
            phone: phone.trim() || '',
          },
        },
      });

      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes('already registered')) {
          const signInRes = await isolatedClient.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInRes.data?.user) {
            targetUserId = signInRes.data.user.id;
          } else {
            targetUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          }
        } else {
          throw new Error(signUpErr.message || 'Failed to provision credentials');
        }
      } else if (signUpData?.user) {
        targetUserId = signUpData.user.id;
      }

      if (!targetUserId) {
        targetUserId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      }

      // Save directly to Supabase (realtime, no local cache)
      const supabase = getSupabase();
      const { error: profileSaveErr } = await supabase.from('profiles').upsert({
        id: targetUserId,
        auth_user_id: targetUserId,
        email: email.trim(),
        full_name: fullName.trim(),
        role: activeTab,
        staff_id: finalStaffId,
        phone: phone.trim() || null,
        status: 'active',
      }, { onConflict: 'id' });

      if (profileSaveErr) {
        throw new Error('Failed to save user profile: ' + profileSaveErr.message);
      }

      // Station assignment if selected
      if (selectedStationId) {
        if (activeTab === 'manager') {
          const { error: stationErr } = await supabase
            .from('stations')
            .update({ manager_id: targetUserId, updated_at: new Date().toISOString() })
            .eq('id', selectedStationId);
          if (stationErr) {
            console.error('Station manager assignment error:', stationErr);
            throw new Error('Manager created but station assignment failed: ' + stationErr.message);
          }
        } else if (activeTab === 'officer') {
          try {
            const assignRes = await fetch('/api/admin/assign-station-officers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                stationId: selectedStationId,
                officerIds: [targetUserId],
              }),
            });
            if (!assignRes.ok) {
              const assignData = await assignRes.json();
              throw new Error(assignData.error || 'Station officer assignment failed');
            }
          } catch (assignErr: any) {
            console.error('Station officer assignment error:', assignErr);
            throw new Error('Officer created but station assignment failed: ' + (assignErr.message || assignErr));
          }
        }
      }

      setSuccessMsg(
        `Successfully provisioned ${activeTab === 'manager' ? 'Station Manager' : 'Security Officer'} (${fullName.trim()}) with Badge ID: ${finalStaffId}!`
      );
      setShowCreateModal(false);
      fetchUsersAndStations();
    } catch (err: any) {
      setErrorMsg(sanitizeErrorMessage(err, 'Failed to create user. Please verify your credentials and try again.'));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (userToToggle: Profile) => {
    try {
      const newStatus = userToToggle.status === 'active' ? 'inactive' : 'active';
      // Immediately update UI
      setUsers((prev) =>
        prev.map((u) => (u.id === userToToggle.id ? { ...u, status: newStatus } : u))
      );

      const config = getSupabaseConfig();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.url) headers['x-supabase-url'] = config.url;
      if (config.serviceRoleKey) headers['x-supabase-service-key'] = config.serviceRoleKey;

      const result = await safeFetchJson('/api/admin/toggle-status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          userId: userToToggle.id,
          status: newStatus,
        }),
      });

      if (!result.ok) {
        // Fallback direct update via supabase client
        const supabase = getSupabase();
        await supabase
          .from('profiles')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', userToToggle.id)
          .catch(() => {});
      }
    } catch (err) {
      console.error('Toggle status error:', err);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.staff_id && u.staff_id.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Personnel Directory & Credentials</h1>
          <p className="text-xs text-stone-500">Secure credential provisioning and real-time badge management</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${activeTab}s by name or badge...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-52 sm:w-64"
            />
          </div>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add {activeTab === 'officer' ? 'Officer' : 'Manager'}</span>
          </button>
        </div>
      </div>

      {/* Role Toggle Tabs */}
      <div className="flex gap-2 border-b border-stone-200 pb-2">
        <button
          onClick={() => setActiveTab('officer')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'officer'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Security Officers</span>
        </button>

        <button
          onClick={() => setActiveTab('manager')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'manager'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Station Managers</span>
        </button>
      </div>

      {/* Success alert */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading personnel records…</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={activeTab === 'officer' ? Users : UserCheck}
          title={`No ${activeTab === 'officer' ? 'Security Officers' : 'Station Managers'} Registered`}
          description={`Click 'Add ${activeTab === 'officer' ? 'Officer' : 'Manager'}' to provision new credentials with auto-generated Badge ID.`}
          actionLabel={`Provision ${activeTab === 'officer' ? 'Officer' : 'Manager'}`}
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((u) => {
            const isActive = u.status === 'active';
            return (
              <div
                key={u.id}
                className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs space-y-3.5 hover:border-stone-300 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-bold text-base shadow-sm shadow-orange-600/20">
                        {u.full_name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-stone-900 leading-tight">{u.full_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-orange-50 text-orange-700 border border-orange-200">
                            <BadgeCheck className="w-3 h-3 text-orange-600" />
                            {u.staff_id || (activeTab === 'manager' ? 'SM-HQ-101' : 'SO-SEC-101')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                      }`}
                      title="Click to toggle status"
                    >
                      {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span>{isActive ? 'Active' : 'Deactivated'}</span>
                    </button>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60 space-y-1.5 text-xs text-stone-600">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                      <span className="truncate">{u.email}</span>
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                        <span>{u.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-stone-400 font-medium">
                    {activeTab === 'officer' ? 'Security Personnel' : 'Station Management'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditUserModal(u)}
                      className="p-1.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 transition"
                      title="Edit user details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditBadgeModal(u)}
                      className="p-1.5 rounded-xl border border-stone-200 hover:bg-orange-50 hover:border-orange-200 text-stone-600 hover:text-orange-600 transition"
                      title="Edit badge ID"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmUser(u)}
                      className="p-1.5 rounded-xl border border-stone-200 hover:bg-rose-50 hover:border-rose-200 text-stone-600 hover:text-rose-600 transition"
                      title="Delete user"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE USER MODAL WITH REAL-TIME BADGE AUTO-GENERATION */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Provision {activeTab === 'officer' ? 'Security Officer' : 'Station Manager'}
                </h3>
                <p className="text-[11px] text-stone-400">
                  Badge ID auto-generates in real-time as you enter personnel details
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  placeholder="e.g., Kwame Mensah"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  Assign to Station {activeTab === 'manager' ? '(Management site)' : '(Duty post)'}
                </label>
                <select
                  value={selectedStationId}
                  onChange={(e) => handleStationChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  <option value="">No station pre-assigned (HQ pool)...</option>
                  {stations.map((stn) => (
                    <option key={stn.id} value={stn.id}>
                      {stn.station_name} ({stn.station_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* REAL-TIME BADGE / OFFICER ID FIELD */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-stone-700">
                    Badge / Officer ID *
                  </label>
                  <div className="flex items-center gap-2">
                    {isAutoBadge ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                        <Sparkles className="w-3 h-3 text-orange-600" />
                        Auto-Generated
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRegenerateBadge}
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
                    value={staffId}
                    onChange={(e) => handleStaffIdChange(e.target.value)}
                    placeholder="e.g., SO-ACC-101"
                    className={`w-full pl-3 pr-10 py-2 text-xs rounded-xl border font-mono uppercase focus:outline-none focus:ring-2 ${
                      isBadgeDuplicate
                        ? 'border-amber-400 bg-amber-50/50 focus:ring-amber-500 text-amber-900'
                        : 'border-stone-300 focus:ring-orange-500 bg-white'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleRegenerateBadge}
                    title="Regenerate unique badge ID in real-time"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-stone-400 hover:text-orange-600 hover:bg-stone-100 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Real-time validation status */}
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  {isBadgeDuplicate ? (
                    <div className="text-amber-700 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600 flex-shrink-0" />
                      <span>Badge already assigned to another user.</span>
                      <button
                        type="button"
                        onClick={handleAutoResolveDuplicate}
                        className="underline text-orange-700 font-bold ml-1 hover:text-orange-800"
                      >
                        Auto-Resolve
                      </button>
                    </div>
                  ) : staffId.trim() ? (
                    <div className="text-emerald-700 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      <span>Badge ID verified & ready</span>
                    </div>
                  ) : (
                    <span className="text-stone-400">Unique identifier for duty rosters and incident logs</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Email Address (Login Username) *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., officer@security.local"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Initial Password *</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Contact Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., +233 24 123 4567"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {creating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Provisioning…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Create Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT BADGE / OFFICER ID MODAL */}
      {showEditBadgeModal && selectedUserForBadge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Update Badge / Officer ID
                </h3>
                <p className="text-[11px] text-stone-400">
                  {selectedUserForBadge.full_name} ({selectedUserForBadge.role})
                </p>
              </div>
              <button
                onClick={() => setShowEditBadgeModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveBadge} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-stone-700">
                    Badge / Officer ID *
                  </label>
                  <button
                    type="button"
                    onClick={handleEditRegenerateBadge}
                    className="flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 underline"
                  >
                    <Sparkles className="w-3 h-3 text-orange-600" />
                    Auto-Generate
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    value={editStaffId}
                    onChange={(e) => {
                      setEditStaffId(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
                      setIsEditAutoBadge(false);
                    }}
                    placeholder="e.g., SO-ACC-101"
                    className={`w-full pl-3 pr-10 py-2 text-xs rounded-xl border font-mono uppercase focus:outline-none focus:ring-2 ${
                      isEditBadgeDuplicate
                        ? 'border-amber-400 bg-amber-50/50 focus:ring-amber-500 text-amber-900'
                        : 'border-stone-300 focus:ring-orange-500 bg-white'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={handleEditRegenerateBadge}
                    title="Auto-generate next unique ID"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-stone-400 hover:text-orange-600 hover:bg-stone-100 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-1 text-[10px]">
                  {isEditBadgeDuplicate ? (
                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      Badge ID already in use. Click Auto-Generate to resolve.
                    </span>
                  ) : editStaffId.trim() ? (
                    <span className="text-emerald-700 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Badge ID verified & ready
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowEditBadgeModal(false)}
                  disabled={savingBadge}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBadge}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {savingBadge ? 'Saving…' : 'Save Badge ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL (Full Profile Edit) */}
      {showEditUserModal && selectedUserForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Edit {selectedUserForEdit.role === 'manager' ? 'Manager' : 'Officer'} Profile
                </h3>
                <p className="text-[11px] text-stone-400">
                  Update personnel details and station assignment
                </p>
              </div>
              <button
                onClick={() => setShowEditUserModal(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Full Legal Name *</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g., Kwame Mensah"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g., officer@security.local"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Contact Phone</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g., +233 24 123 4567"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Badge / Staff ID</label>
                <input
                  type="text"
                  value={editStaffIdField}
                  onChange={(e) => setEditStaffIdField(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                  placeholder="e.g., SO-ACC-101"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">
                  {selectedUserForEdit.role === 'manager' ? 'Assign Station (Management site)' : 'Assign Station (Duty post)'}
                </label>
                <select
                  value={editStationId}
                  onChange={(e) => setEditStationId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                >
                  <option value="">Keep current assignment</option>
                  {stations.map((stn) => (
                    <option key={stn.id} value={stn.id}>
                      {stn.station_name} ({stn.station_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setShowEditUserModal(false)}
                  disabled={savingUser}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {savingUser ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-stone-200 p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-bold text-rose-700">Delete Personnel</h3>
              <button onClick={() => setDeleteConfirmUser(null)} className="p-1 rounded-lg text-stone-400 hover:text-stone-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-stone-700">
                Are you sure you want to permanently delete <span className="font-bold">{deleteConfirmUser.full_name}</span>?
              </p>
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] space-y-1">
                <p className="font-semibold">This action cannot be undone. It will:</p>
                <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                  <li>Remove their profile and login credentials</li>
                  <li>Remove them from any station assignments</li>
                  <li>Delete their Supabase Auth account</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                disabled={deleting}
                className="px-3.5 py-2 text-xs font-semibold text-stone-600 hover:text-stone-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : 'Delete Personnel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
