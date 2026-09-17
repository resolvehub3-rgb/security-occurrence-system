import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { Profile, StationOfficer } from '../../types';
import { formatGhanaDate } from '../../utils/timezone';
import {
  Users,
  Building,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  BadgeCheck,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const ManagerOfficers: React.FC = () => {
  const { user, assignedStation } = useAuth();
  const [stationOfficers, setStationOfficers] = useState<StationOfficer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOfficers = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const supabase = getSupabase();

      let stationId = assignedStation?.id;
      if (!stationId) {
        const { data: st } = await supabase
          .from('stations')
          .select('id')
          .eq('manager_id', user.id)
          .maybeSingle();
        stationId = st?.id;
      }

      if (!stationId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('station_officers')
        .select(`
          *,
          officer:profiles!station_officers_officer_id_fkey(*)
        `)
        .eq('station_id', stationId)
        .order('assigned_at', { ascending: false });

      if (error) {
        console.error('Error loading station officers:', error);
      } else {
        setStationOfficers((data as StationOfficer[]) || []);
      }
    } catch (err) {
      console.error('Failed to load station officers:', err);
    } finally {
      setLoading(false);
    }
  }, [user, assignedStation]);

  useEffect(() => {
    fetchOfficers();
  }, [fetchOfficers]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Station Security Officers</h1>
          <p className="text-xs text-stone-500">Security personnel assigned to your operational facility</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-orange-50 text-orange-700 border border-orange-200">
          {stationOfficers.length} Assigned Officers
        </span>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading assigned security personnel…</p>
        </div>
      ) : stationOfficers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Officers Assigned"
          description="There are currently no security officers assigned to your station. An administrator can assign officers in the Station Administration console."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stationOfficers.map((item) => {
            const officer = item.officer as Profile;
            const isActive = item.active && officer?.status === 'active';
            return (
              <div
                key={item.id}
                className="p-5 bg-white rounded-3xl border border-stone-200/90 shadow-2xs space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-bold text-base shadow-sm shadow-orange-600/20">
                      {officer?.full_name?.charAt(0) || 'O'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-stone-900">{officer?.full_name || 'Officer'}</div>
                      <div className="text-xs text-stone-400 font-medium">Badge: {officer?.staff_id || 'SEC-ID'}</div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-stone-100 text-stone-600 border-stone-200'
                    }`}
                  >
                    {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    <span>{isActive ? 'Active Duty' : 'Inactive'}</span>
                  </span>
                </div>

                <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60 space-y-1.5 text-xs text-stone-600">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                    <span className="truncate">{officer?.email}</span>
                  </div>
                  {officer?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                      <span>{officer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-stone-200/50 text-[11px] text-stone-400">
                    <BadgeCheck className="w-3.5 h-3.5 text-stone-400" />
                    <span>Assigned since {formatGhanaDate(item.assigned_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
