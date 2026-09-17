import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabase } from '../../lib/supabase';
import { Occurrence } from '../../types';
import { formatGhanaDateTime, formatGhanaTime } from '../../utils/timezone';
import {
  ShieldAlert,
  Search,
  Image as ImageIcon,
  Video,
  Clock,
  User,
  ExternalLink,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const ManagerOccurrences: React.FC = () => {
  const { user, assignedStation } = useAuth();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchOccurrences = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Find managed station id
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
        .from('occurrences')
        .select(`
          *,
          officer:profiles!occurrences_officer_id_fkey(*),
          evidence:occurrence_evidence(*)
        `)
        .eq('station_id', stationId)
        .order('occurrence_time', { ascending: false });

      if (error) {
        console.error('Error fetching station occurrences:', error);
      } else {
        setOccurrences((data as Occurrence[]) || []);
      }
    } catch (err) {
      console.error('Failed to load occurrences:', err);
    } finally {
      setLoading(false);
    }
  }, [user, assignedStation]);

  useEffect(() => {
    fetchOccurrences();
  }, [fetchOccurrences]);

  const filtered = occurrences.filter((occ) => {
    const q = searchQuery.toLowerCase();
    const officerMatch = occ.officer?.full_name?.toLowerCase().includes(q);
    const descMatch = occ.description?.toLowerCase().includes(q);
    return !q || officerMatch || descMatch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">Station Occurrences Log</h1>
          <p className="text-xs text-stone-500">Comprehensive real-time logbook of events recorded at this station</p>
        </div>

        {/* Search bar */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search descriptions or officer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading occurrences log…</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No occurrences recorded yet."
          description={searchQuery ? 'No log entries match your search query.' : 'Occurrences logged by officers during active duty will appear here in real-time.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((occ) => (
            <div
              key={occ.id}
              className="p-5 bg-white rounded-2xl border border-stone-200/90 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-700 flex items-center justify-center font-bold text-xs">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-bold text-stone-900">{occ.officer?.full_name || 'Officer'}</div>
                    <div className="text-[10px] text-stone-400">{occ.officer?.staff_id}</div>
                  </div>
                </div>
                <span className="text-[11px] text-stone-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatGhanaDateTime(occ.occurrence_time)}
                </span>
              </div>

              <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap bg-stone-50/70 p-3 rounded-xl border border-stone-200/50">
                {occ.description}
              </p>

              {occ.evidence && occ.evidence.length > 0 && (
                <div className="pt-2 border-t border-stone-100 flex flex-wrap gap-2">
                  {occ.evidence.map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.public_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-50 hover:bg-orange-50 border border-stone-200 text-xs text-stone-700 hover:text-orange-700 font-medium transition"
                    >
                      {ev.file_type.startsWith('video/') ? (
                        <Video className="w-3.5 h-3.5 text-orange-600" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-orange-600" />
                      )}
                      <span className="truncate max-w-[140px]">{ev.file_name}</span>
                      <ExternalLink className="w-3 h-3 text-stone-400" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
