import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { getSupabase, getSupabaseConfig } from '../lib/supabase';
import { sanitizeErrorMessage } from '../lib/safeFetch';
import { Profile, Station, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  assignedStation: Station | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUpAdmin: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignedStation, setAssignedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(getSupabaseConfig().isConfigured);

  const fetchProfileAndStation = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setProfile(null);
      setAssignedStation(null);
      return;
    }

    try {
      const supabase = getSupabase();
      // Fetch profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileErr) {
        console.error('Error fetching user profile:', profileErr);
      }

      if (profileData) {
        setProfile(profileData as Profile);

        // If officer: fetch assigned station
        if (profileData.role === 'officer') {
          const { data: officerStation } = await supabase
            .from('station_officers')
            .select('station_id, stations(*)')
            .eq('officer_id', authUser.id)
            .eq('active', true)
            .maybeSingle();

          if (officerStation && officerStation.stations) {
            setAssignedStation(officerStation.stations as unknown as Station);
          } else {
            setAssignedStation(null);
          }
        } else if (profileData.role === 'manager') {
          // If manager: fetch managed station
          const { data: managerStation } = await supabase
            .from('stations')
            .select('*')
            .eq('manager_id', authUser.id)
            .maybeSingle();

          if (managerStation) {
            setAssignedStation(managerStation as Station);
          } else {
            setAssignedStation(null);
          }
        } else {
          setAssignedStation(null);
        }
      } else {
        // Auth user exists but profile row doesn't exist yet (e.g. metadata role from initial signup)
        const userMeta = authUser.user_metadata || {};
        const fallbackProfile: Profile = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: userMeta.full_name || authUser.email?.split('@')[0] || 'User',
          role: (userMeta.role as UserRole) || 'admin',
          status: 'active',
        };
        setProfile(fallbackProfile);

        // Attempt to create profile row if missing
        await supabase.from('profiles').upsert({
          id: authUser.id,
          auth_user_id: authUser.id,
          email: authUser.email || '',
          full_name: fallbackProfile.full_name,
          role: fallbackProfile.role,
          status: 'active',
        });

        // After creating fallback profile, fetch managed station
        if (fallbackProfile.role === 'manager') {
          const { data: managerStation } = await supabase
            .from('stations')
            .select('*')
            .eq('manager_id', authUser.id)
            .maybeSingle();
          if (managerStation) {
            setAssignedStation(managerStation as Station);
          }
        } else if (fallbackProfile.role === 'officer') {
          const { data: officerStation } = await supabase
            .from('station_officers')
            .select('station_id, stations(*)')
            .eq('officer_id', authUser.id)
            .eq('active', true)
            .maybeSingle();
          if (officerStation && officerStation.stations) {
            setAssignedStation(officerStation.stations as unknown as Station);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  }, []);

  useEffect(() => {
    const config = getSupabaseConfig();
    setIsConfigured(config.isConfigured);

    if (!config.isConfigured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfileAndStation(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await fetchProfileAndStation(newSession.user);
      } else {
        setProfile(null);
        setAssignedStation(null);
      }
      setLoading(false);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfileAndStation]);

  // Realtime: listen for station manager_id changes so manager sees assignment immediately
  useEffect(() => {
    if (!user || !profile || profile.role !== 'manager') return;

    const supabase = getSupabase();
    const channel = supabase
      .channel('auth-station-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, async (payload) => {
        // Re-fetch station assignment when any station changes
        const { data: managerStation } = await supabase
          .from('stations')
          .select('*')
          .eq('manager_id', user.id)
          .maybeSingle();
        setAssignedStation((managerStation as Station) || null);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const config = getSupabaseConfig();
      if (!config.isConfigured) {
        const isDeployed = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
        return {
          success: false,
          error: isDeployed
            ? 'Supabase credentials are not configured in this deployment. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables in your Vercel dashboard, then redeploy.'
            : config.configError ||
              'Supabase credentials are not configured. Please set your Supabase URL & Anon Key in the Setup configuration.',
        };
      }

      const supabase = getSupabase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return { success: false, error: sanitizeErrorMessage(error.message, 'Invalid credentials. Please verify and try again.') };
      }

      if (data.user) {
        setUser(data.user);
        setSession(data.session);
        await fetchProfileAndStation(data.user);
      }

      return { success: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('TypeError')) {
        return {
          success: false,
          error:
            'Unable to reach the authentication server. The server proxy also failed. Please restart the server and try again, or disable browser extensions that may block network requests.',
        };
      }
      return { success: false, error: sanitizeErrorMessage(err, 'An unexpected error occurred during sign in') };
    }
  };

  const signUpAdmin = async (email: string, password: string, fullName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const config = getSupabaseConfig();
      if (config.configError) {
        return { success: false, error: config.configError };
      }

      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: 'admin',
          },
        },
      });

      if (error) {
        return { success: false, error: sanitizeErrorMessage(error.message, 'Failed to sign up admin') };
      }

      if (data.user) {
        // Upsert into profiles
        await supabase.from('profiles').upsert({
          id: data.user.id,
          auth_user_id: data.user.id,
          email: email.trim(),
          full_name: fullName.trim(),
          role: 'admin',
          status: 'active',
        });
        await fetchProfileAndStation(data.user);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: sanitizeErrorMessage(err, 'Failed to sign up admin') };
    }
  };

  const signOut = async () => {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setAssignedStation(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfileAndStation(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        assignedStation,
        loading,
        isConfigured,
        signIn,
        signUpAdmin,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
