import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // In-memory dynamic Supabase configuration synced from client or env
  let dynamicSupabaseConfig = {
    url: (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim(),
    anonKey: (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  };

  // Helper to get supabase admin client (supports env vars, dynamic config, and request headers)
  const getSupabaseAdmin = (req?: express.Request) => {
    const headerUrl = req?.headers['x-supabase-url'] as string | undefined;
    const headerKey = req?.headers['x-supabase-service-key'] as string | undefined;

    const supabaseUrl = (headerUrl || dynamicSupabaseConfig.url || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
    const serviceRoleKey = (headerKey || dynamicSupabaseConfig.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    if (!supabaseUrl || !serviceRoleKey) {
      return null;
    }
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  };

  // API: Health check & configuration status
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      serviceRoleConfigured: !!(dynamicSupabaseConfig.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY),
      supabaseUrlConfigured: !!(dynamicSupabaseConfig.url || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
      supabaseAnonConfigured: !!(dynamicSupabaseConfig.anonKey || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY),
    });
  });

  // API: Dynamic Supabase configuration endpoint
  app.post('/api/admin/configure-supabase', (req, res) => {
    try {
      const { url, anonKey, serviceRoleKey, clear } = req.body;
      if (clear) {
        dynamicSupabaseConfig = {
          url: (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim(),
          anonKey: (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim(),
          serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
        };
        return res.json({ success: true, cleared: true });
      }

      if (url) dynamicSupabaseConfig.url = url.trim();
      if (anonKey) dynamicSupabaseConfig.anonKey = anonKey.trim();
      if (serviceRoleKey !== undefined) dynamicSupabaseConfig.serviceRoleKey = (serviceRoleKey || '').trim();

      return res.json({
        success: true,
        serviceRoleConfigured: !!(dynamicSupabaseConfig.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY),
        supabaseUrlConfigured: !!(dynamicSupabaseConfig.url || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API: Admin list users / profiles with auto-heal for orphaned auth users
  app.get('/api/admin/list-users', async (req, res) => {
    try {
      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'Service role key is not configured on the server' });
      }

      const role = req.query.role as string | undefined;

      let query = adminClient.from('profiles').select('*').order('created_at', { ascending: false });
      if (role && ['officer', 'manager', 'admin'].includes(role)) {
        query = query.eq('role', role);
      }

      const { data: profiles, error: profErr } = await query;
      if (profErr) {
        return res.status(500).json({ error: profErr.message });
      }

      const userProfiles = (profiles || []) as any[];

      // Auto-heal: Check if any auth users exist in auth.users that are missing in public.profiles
      try {
        const { data: authUsersData } = await adminClient.auth.admin.listUsers();
        if (authUsersData && authUsersData.users) {
          const existingProfileIds = new Set(userProfiles.map((p) => p.id));
          const existingEmails = new Set(userProfiles.map((p) => (p.email || '').toLowerCase()));

          for (const u of authUsersData.users) {
            if (u.email && !existingEmails.has(u.email.toLowerCase()) && !existingProfileIds.has(u.id)) {
              const meta = u.user_metadata || {};
              const userRole = (meta.role || 'officer') as string;
              if (!role || userRole === role) {
                const healedProfile = {
                  id: u.id,
                  auth_user_id: u.id,
                  email: u.email,
                  full_name: meta.full_name || u.email.split('@')[0],
                  role: userRole,
                  staff_id: meta.staff_id || null,
                  phone: meta.phone || null,
                  status: 'active',
                  created_at: u.created_at || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                await adminClient.from('profiles').upsert(healedProfile);
                userProfiles.unshift(healedProfile);
              }
            }
          }
        }
      } catch (autoHealErr) {
        console.warn('Auto-heal orphaned auth users notice:', autoHealErr);
      }

      return res.json({ success: true, users: userProfiles });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list users' });
    }
  });

  // API: Admin dashboard statistics (uses service role key to bypass RLS)
  app.get('/api/admin/dashboard-stats', async (req, res) => {
    try {
      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' });
      }

      const [
        { count: occCount },
        { count: stnCount },
        { count: mgrCount },
        { count: offCount },
        { count: sessCount },
        { count: repCount },
      ] = await Promise.all([
        adminClient.from('occurrences').select('id', { count: 'exact', head: true }),
        adminClient.from('stations').select('id', { count: 'exact', head: true }),
        adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'manager'),
        adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'officer'),
        adminClient.from('duty_sessions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        adminClient.from('duty_reports').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
      ]);

      return res.json({
        totalOccurrences: occCount || 0,
        totalStations: stnCount || 0,
        totalManagers: mgrCount || 0,
        totalOfficers: offCount || 0,
        activeSessions: sessCount || 0,
        finalizedReports: repCount || 0,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch dashboard stats' });
    }
  });

  // API: Admin sidebar counts (uses service role key to bypass RLS)
  app.get('/api/admin/sidebar-counts', async (req, res) => {
    try {
      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' });
      }

      const [
        { count: stnCount },
        { count: userCount },
        { count: occCount },
        { count: repCount },
        { count: auditCount },
      ] = await Promise.all([
        adminClient.from('stations').select('id', { count: 'exact', head: true }),
        adminClient.from('profiles').select('id', { count: 'exact', head: true }),
        adminClient.from('occurrences').select('id', { count: 'exact', head: true }),
        adminClient.from('duty_reports').select('id', { count: 'exact', head: true }).eq('status', 'finalized'),
        adminClient.from('audit_logs').select('id', { count: 'exact', head: true }),
      ]);

      return res.json({
        stations: stnCount || 0,
        personnel: userCount || 0,
        occurrences: occCount || 0,
        reports: repCount || 0,
        auditLogs: auditCount || 0,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch sidebar counts' });
    }
  });

  // API: Admin create user (Officer or Manager)
  // Uses SUPABASE_SERVICE_ROLE_KEY securely on the server so keys are never exposed in browser
  app.post('/api/admin/create-user', async (req, res) => {
    try {
      const { email, password, fullName, role, phone, staffId, stationId } = req.body;

      if (!email || !password || !fullName || !role) {
        return res.status(400).json({ error: 'Missing required fields: email, password, fullName, and role.' });
      }

      if (!['admin', 'manager', 'officer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be admin, manager, or officer.' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({
          error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Please configure SUPABASE_SERVICE_ROLE_KEY in your settings.',
        });
      }

      // Ensure staffId is normalized, uppercase, and guaranteed non-empty with no errors
      let finalStaffId = staffId ? staffId.toString().trim().toUpperCase() : '';
      if (!finalStaffId) {
        const prefix = role === 'manager' ? 'SM' : 'SO';
        finalStaffId = `${prefix}-SEC-${Math.floor(100 + Math.random() * 900)}`;
      }

      let userId: string = '';

      // 1. Create auth user with confirmed email (or retrieve if already created in auth)
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName.trim(),
          role,
          phone: phone || '',
          staff_id: finalStaffId,
        },
      });

      if (authError) {
        // If user already exists in auth.users, fetch and update them
        if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existingUser = listData?.users?.find(
            (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
          );
          if (existingUser) {
            userId = existingUser.id;
            await adminClient.auth.admin.updateUserById(userId, {
              password,
              user_metadata: {
                full_name: fullName.trim(),
                role,
                phone: phone || '',
                staff_id: finalStaffId,
              },
            });
          } else {
            return res.status(400).json({ error: authError.message });
          }
        } else {
          return res.status(400).json({ error: authError.message });
        }
      } else {
        userId = authData.user.id;
      }

      // 2. Insert or update the profile in public.profiles
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          id: userId,
          auth_user_id: userId,
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          phone: phone ? phone.trim() : null,
          staff_id: finalStaffId,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (profileError) {
        return res.status(500).json({ error: 'Failed to create profile record: ' + profileError.message });
      }

      // 3. If stationId is provided, assign to station
      if (stationId) {
        if (role === 'manager') {
          await adminClient
            .from('stations')
            .update({ manager_id: userId, updated_at: new Date().toISOString() })
            .eq('id', stationId);
        } else if (role === 'officer') {
          try {
            await adminClient.from('station_officers').upsert({
              station_id: stationId,
              officer_id: userId,
              active: true,
            });
          } catch (stnOffErr) {
            console.warn('Station officer assignment warning:', stnOffErr);
          }
        }
      }

      // 4. Log audit action
      try {
        await adminClient.from('audit_logs').insert({
          actor_user_id: req.headers['x-admin-id'] || userId,
          action: 'user_created',
          entity_type: 'profile',
          entity_id: userId,
          metadata: { email, role, fullName, staffId: finalStaffId, stationId },
        });
      } catch {}

      return res.status(201).json({
        success: true,
        user: profile || {
          id: userId,
          email,
          full_name: fullName,
          role,
          staff_id: finalStaffId,
          status: 'active',
        },
      });
    } catch (err: any) {
      console.error('Error creating user:', err);
      return res.status(500).json({ error: err.message || 'Internal server error while creating user' });
    }
  });

  // API: Admin update user status (activate/deactivate) - supports both endpoint paths and methods
  const handleToggleUserStatus = async (req: express.Request, res: express.Response) => {
    try {
      const { userId, status } = req.body;
      if (!userId || !status) {
        return res.status(400).json({ error: 'Missing userId or status' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
      }

      const { error: updateError } = await adminClient
        .from('profiles')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) {
        return res.status(400).json({ error: updateError.message });
      }

      // Also ban/unban in Supabase Auth if needed
      try {
        if (status === 'inactive') {
          await adminClient.auth.admin.updateUserById(userId, {
            ban_duration: '876000h', // 100 years
          });
        } else {
          await adminClient.auth.admin.updateUserById(userId, {
            ban_duration: 'none',
          });
        }
      } catch (authBanErr) {
        console.warn('Auth ban notice:', authBanErr);
      }

      return res.json({ success: true, status });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  };

  app.post('/api/admin/toggle-user-status', handleToggleUserStatus);
  app.post('/api/admin/toggle-status', handleToggleUserStatus);
  app.patch('/api/admin/toggle-status', handleToggleUserStatus);

  // API: Admin update Badge / Staff ID for existing user
  app.post('/api/admin/update-badge', async (req, res) => {
    try {
      const { userId, staffId } = req.body;
      if (!userId || !staffId) {
        return res.status(400).json({ error: 'Missing userId or staffId' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server.' });
      }

      const formattedId = staffId.toString().trim().toUpperCase();

      // Update public.profiles
      const { data, error } = await adminClient
        .from('profiles')
        .update({ staff_id: formattedId, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Also update auth user metadata if possible
      try {
        await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: { staff_id: formattedId },
        });
      } catch (authMetaErr) {
        console.warn('Auth metadata update notice:', authMetaErr);
      }

      return res.json({ success: true, profile: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API: Admin delete user (removes profile + auth user)
  app.post('/api/admin/delete-user', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' });
      }

      // 1. Remove station assignments (manager or officer)
      try {
        await adminClient.from('stations').update({ manager_id: null, updated_at: new Date().toISOString() }).eq('manager_id', userId);
        await adminClient.from('station_officers').update({ active: false }).eq('officer_id', userId);
      } catch (relErr) {
        console.warn('Station cleanup warning:', relErr);
      }

      // 2. Delete profile
      const { error: profileErr } = await adminClient.from('profiles').delete().eq('id', userId);
      if (profileErr) {
        return res.status(400).json({ error: 'Failed to delete profile: ' + profileErr.message });
      }

      // 3. Delete from Supabase Auth
      try {
        await adminClient.auth.admin.deleteUser(userId);
      } catch (authDelErr) {
        console.warn('Auth user deletion notice:', authDelErr);
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to delete user' });
    }
  });

  // API: Admin update user profile (name, email, phone, staff_id, station)
  app.post('/api/admin/update-user', async (req, res) => {
    try {
      const { userId, full_name, email, phone, staff_id, stationId, role } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' });
      }

      // 1. Update profile
      const profilePayload: any = { updated_at: new Date().toISOString() };
      if (full_name !== undefined) profilePayload.full_name = full_name.trim();
      if (email !== undefined) profilePayload.email = email.trim();
      if (phone !== undefined) profilePayload.phone = phone.trim() || null;
      if (staff_id !== undefined) profilePayload.staff_id = staff_id.trim().toUpperCase();

      const { data: profile, error: profileErr } = await adminClient
        .from('profiles')
        .update(profilePayload)
        .eq('id', userId)
        .select()
        .single();

      if (profileErr) {
        return res.status(400).json({ error: 'Failed to update profile: ' + profileErr.message });
      }

      // 2. Update auth metadata
      try {
        const authMeta: any = {};
        if (full_name !== undefined) authMeta.full_name = full_name.trim();
        if (email !== undefined) authMeta.email = email.trim();
        if (staff_id !== undefined) authMeta.staff_id = staff_id.trim().toUpperCase();
        if (role !== undefined) authMeta.role = role;
        if (Object.keys(authMeta).length > 0) {
          await adminClient.auth.admin.updateUserById(userId, { user_metadata: authMeta });
        }
      } catch (authMetaErr) {
        console.warn('Auth metadata update notice:', authMetaErr);
      }

      // 3. Update station assignment if provided
      if (stationId !== undefined) {
        if (role === 'manager') {
          // Remove from any previous station
          await adminClient.from('stations').update({ manager_id: null }).eq('manager_id', userId);
          // Assign to new station
          if (stationId) {
            await adminClient.from('stations').update({ manager_id: userId, updated_at: new Date().toISOString() }).eq('id', stationId);
          }
        } else if (role === 'officer') {
          // Deactivate previous officer assignments
          await adminClient.from('station_officers').update({ active: false }).eq('officer_id', userId);
          // Assign to new station
          if (stationId) {
            await adminClient.from('station_officers').upsert({
              station_id: stationId,
              officer_id: userId,
              active: true,
            }, { onConflict: 'station_id,officer_id' });
          }
        }
      }

      return res.json({ success: true, profile });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to update user' });
    }
  });

  // API: Admin save station (Create or Update)
  // Uses SUPABASE_SERVICE_ROLE_KEY to safely bypass RLS policies
  app.post('/api/admin/save-station', async (req, res) => {
    try {
      const { id, station_name, station_code, location, manager_id } = req.body;

      if (!station_name || !station_code || !location) {
        return res.status(400).json({ error: 'Missing required station fields: station_name, station_code, or location.' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({
          error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Falling back to direct database client.',
        });
      }

      const payload: any = {
        station_name: station_name.trim(),
        station_code: station_code.trim().toUpperCase(),
        location: location.trim(),
        manager_id: manager_id || null,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { data, error } = await adminClient
          .from('stations')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (error) throw new Error(error.message);
        return res.json({ success: true, station: data });
      } else {
        const { data, error } = await adminClient
          .from('stations')
          .insert(payload)
          .select()
          .single();

        if (error) throw new Error(error.message);
        return res.json({ success: true, station: data });
      }
    } catch (err: any) {
      console.error('Server error saving station:', err);
      return res.status(500).json({ error: err.message || 'Failed to save station on server' });
    }
  });

  // API: Admin toggle station status
  app.post('/api/admin/toggle-station-status', async (req, res) => {
    try {
      const { id, status } = req.body;
      if (!id || !status) {
        return res.status(400).json({ error: 'Missing id or status' });
      }

      const adminClient = getSupabaseAdmin();
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' });
      }

      const { data, error } = await adminClient
        .from('stations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return res.json({ success: true, station: data });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API: Admin delete station (uses service role key to bypass RLS)
  app.post('/api/admin/delete-station', async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing station id' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' });
      }

      // 1. Deactivate all officer assignments for this station
      const { error: deactivateErr } = await adminClient
        .from('station_officers')
        .update({ active: false })
        .eq('station_id', id);

      if (deactivateErr) {
        console.error('Error deactivating station officers before delete:', deactivateErr);
      }

      // 2. Delete the station
      const { error: deleteErr } = await adminClient
        .from('stations')
        .delete()
        .eq('id', id);

      if (deleteErr) throw new Error(deleteErr.message);

      return res.json({ success: true });
    } catch (err: any) {
      console.error('Server error deleting station:', err);
      return res.status(500).json({ error: err.message || 'Failed to delete station' });
    }
  });

  // API: Admin assign officers to a station (uses service role key to bypass RLS)
  app.post('/api/admin/assign-station-officers', async (req, res) => {
    try {
      const { stationId, officerIds } = req.body;
      if (!stationId || !Array.isArray(officerIds)) {
        return res.status(400).json({ error: 'Missing stationId or officerIds array' });
      }

      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured.' });
      }

      // 1. Deactivate all current officers for this station
      const { error: deactivateErr } = await adminClient
        .from('station_officers')
        .update({ active: false })
        .eq('station_id', stationId);

      if (deactivateErr) {
        console.error('Error deactivating station officers:', deactivateErr);
      }

      // 2. Upsert selected officers as active
      if (officerIds.length > 0) {
        const assignments = officerIds.map((officerId: string) => ({
          station_id: stationId,
          officer_id: officerId,
          active: true,
          assigned_at: new Date().toISOString(),
        }));

        const { error: upsertErr } = await adminClient
          .from('station_officers')
          .upsert(assignments, { onConflict: 'station_id,officer_id' });

        if (upsertErr) {
          throw new Error('Failed to assign officers: ' + upsertErr.message);
        }
      }

      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error assigning station officers:', err);
      return res.status(500).json({ error: err.message || 'Failed to assign officers' });
    }
  });

  // API: Seed admin user (zen@admin.com / GoodGod1$)
  app.post('/api/admin/seed-admin', async (req, res) => {
    try {
      const adminClient = getSupabaseAdmin(req);
      if (!adminClient) {
        return res.status(503).json({ error: 'Service role key is not configured on the server' });
      }

      const adminEmail = 'zen@admin.com';
      const adminPassword = 'GoodGod1$';
      const adminFullName = 'System Administrator';

      // Check if admin already exists
      const { data: existingProfiles } = await adminClient
        .from('profiles')
        .select('id, email, role')
        .eq('email', adminEmail)
        .maybeSingle();

      if (existingProfiles && existingProfiles.role === 'admin') {
        return res.json({ success: true, message: 'Admin user already exists', user: existingProfiles });
      }

      // Create or update auth user
      let userId: string = '';
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          role: 'admin',
        },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existingUser = listData?.users?.find((u) => u.email?.toLowerCase() === adminEmail);
          if (existingUser) {
            userId = existingUser.id;
            await adminClient.auth.admin.updateUserById(userId, {
              password: adminPassword,
              user_metadata: { full_name: adminFullName, role: 'admin' },
            });
          } else {
            return res.status(400).json({ error: authError.message });
          }
        } else {
          return res.status(400).json({ error: authError.message });
        }
      } else {
        userId = authData.user.id;
      }

      // Upsert profile with admin role
      const { data: profile, error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          id: userId,
          auth_user_id: userId,
          email: adminEmail,
          full_name: adminFullName,
          role: 'admin',
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .select()
        .single();

      if (profileError) {
        return res.status(500).json({ error: 'Failed to create admin profile: ' + profileError.message });
      }

      return res.json({ success: true, message: 'Admin user seeded successfully', user: profile });
    } catch (err: any) {
      console.error('Error seeding admin:', err);
      return res.status(500).json({ error: err.message || 'Failed to seed admin user' });
    }
  });

  // Auto-seed admin on server startup
  const autoSeedAdmin = async () => {
    try {
      const adminClient = getSupabaseAdmin();
      if (!adminClient) {
        console.log('Skipping admin auto-seed: service role key not configured');
        return;
      }

      const adminEmail = 'zen@admin.com';
      const adminPassword = 'GoodGod1$';
      const adminFullName = 'System Administrator';

      // Check if admin already exists
      const { data: existingProfiles } = await adminClient
        .from('profiles')
        .select('id, email, role')
        .eq('email', adminEmail)
        .maybeSingle();

      if (existingProfiles && existingProfiles.role === 'admin') {
        console.log('Admin user zen@admin.com already exists with admin role');
        return;
      }

      // Create or update auth user
      let userId: string = '';
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: adminFullName,
          role: 'admin',
        },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existingUser = listData?.users?.find((u) => u.email?.toLowerCase() === adminEmail);
          if (existingUser) {
            userId = existingUser.id;
            await adminClient.auth.admin.updateUserById(userId, {
              password: adminPassword,
              user_metadata: { full_name: adminFullName, role: 'admin' },
            });
            console.log('Updated existing admin user zen@admin.com');
          } else {
            console.error('Failed to find existing admin user:', authError.message);
            return;
          }
        } else {
          console.error('Failed to create admin auth user:', authError.message);
          return;
        }
      } else {
        userId = authData.user.id;
        console.log('Created new admin auth user zen@admin.com');
      }

      // Upsert profile with admin role
      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert({
          id: userId,
          auth_user_id: userId,
          email: adminEmail,
          full_name: adminFullName,
          role: 'admin',
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

      if (profileError) {
        console.error('Failed to upsert admin profile:', profileError.message);
      } else {
        console.log('Admin user zen@admin.com seeded successfully with admin role');
      }
    } catch (err: any) {
      console.error('Auto-seed admin error:', err);
    }
  };

  // Run auto-seed on startup
  await autoSeedAdmin();

  // API: Universal Supabase proxy — routes ALL browser requests through the server
  // to completely avoid CORS/network/DNS issues when the browser can't reach Supabase directly
  app.all('/api/supabase-proxy/*', async (req, res) => {
    try {
      const supabaseUrl = dynamicSupabaseConfig.url || process.env.VITE_SUPABASE_URL || '';
      const anonKey = dynamicSupabaseConfig.anonKey || process.env.VITE_SUPABASE_ANON_KEY || '';
      if (!supabaseUrl) {
        return res.status(503).json({ error: 'Supabase URL not configured on server' });
      }

      const targetPath = req.params[0];
      const queryStr = new URL(req.originalUrl, 'http://localhost').search || '';

      const targetUrl = `${supabaseUrl}/${targetPath}`;

      const headers: Record<string, string> = {
        'apikey': anonKey,
      };
      // Forward only safe headers
      const forwardHeaders = ['authorization', 'content-type', 'apikey', 'x-client-info', 'x-supabase-api-version'];
      for (const key of forwardHeaders) {
        const val = req.headers[key];
        if (val && typeof val === 'string') {
          headers[key] = val;
        }
      }
      if (headers['authorization'] && !headers['authorization'].startsWith('Bearer ')) {
        headers['authorization'] = `Bearer ${headers['authorization']}`;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const bodyStr = JSON.stringify(req.body);
        fetchOptions.body = bodyStr;
      }

      const proxyRes = await fetch(targetUrl + queryStr, fetchOptions);
      const contentType = proxyRes.headers.get('content-type') || 'application/json';
      const body = await proxyRes.text();

      res.status(proxyRes.status).set('Content-Type', contentType).send(body);
    } catch (err: any) {
      console.error('Supabase proxy error:', err.message);
      res.status(502).json({ error: 'Proxy failed: ' + err.message });
    }
  });

  // Explicit JSON 404 handler for any unhandled /api/* routes so they NEVER return HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // Vite middleware for dev / static for prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, 'localhost', () => {
    console.log(`Security OMS server running on http://localhost:${PORT}`);
  });
}

startServer();
