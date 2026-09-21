import React, { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { Occurrence, Station } from '../../types';
import { formatGhanaDateTime, formatGhanaTime } from '../../utils/timezone';
import {
  ShieldAlert,
  Search,
  Building,
  User,
  Clock,
  Image as ImageIcon,
  Video,
  Filter,
  ExternalLink,
} from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const AdminGlobalOccurrences: React.FC = () => {
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchGlobalOccurrences = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();

      // Fetch stations for filter dropdown
      const { data: stnData } = await supabase.from('stations').select('*').order('station_name');
      setStations((stnData as Station[]) || []);

      // Fetch occurrences
      let query = supabase
        .from('occurrences')
        .select(`
          *,
          station:stations(*),
          officer:profiles!occurrences_officer_id_fkey(*),
          evidence:occurrence_evidence(*)
        `)
        .order('occurrence_time', { ascending: false });

      if (selectedStationId !== 'all') {
        query = query.eq('station_id', selectedStationId);
      }

      const { data, error } = await query;
      if (error) console.error('Error fetching global occurrences:', error);
      setOccurrences((data as Occurrence[]) || []);
    } catch (err) {
      console.error('Failed to load occurrences:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStationId]);

  useEffect(() => {
    fetchGlobalOccurrences();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-global-occurrences-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => {
        fetchGlobalOccurrences();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGlobalOccurrences]);

  const filtered = occurrences.filter((occ) => {
    const q = searchQuery.toLowerCase();
    const descMatch = occ.description?.toLowerCase().includes(q);
    const officerMatch = occ.officer?.full_name?.toLowerCase().includes(q);
    const stationMatch = occ.station?.station_name?.toLowerCase().includes(q);
    return !q || descMatch || officerMatch || stationMatch;
  });

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-gradient-to-r from-stone-900 via-stone-900 to-stone-950 rounded-3xl p-6 shadow-2xl shadow-stone-950/30">
        <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Global Occurrences Monitor</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                {occurrences.length} Events
              </span>
            </div>
            <p className="text-sm text-stone-400">Live operational stream of security events across all stations</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Station Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-stone-400 flex-shrink-0" />
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-white/10 bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-48"
              >
                <option value="all">All Stations</option>
                {stations.map((stn) => (
                  <option key={stn.id} value={stn.id}>
                    {stn.station_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search descriptions, personnel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-white/10 bg-white/10 text-white placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center bg-gradient-to-br from-stone-50 to-white rounded-3xl border border-stone-200/60">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading live occurrences…</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No occurrences recorded yet."
          description={searchQuery ? 'No occurrences match your current filters.' : 'Events recorded by active security officers will appear here instantly in real-time.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((occ) => (
            <div
              key={occ.id}
              className="p-5 bg-white/80 backdrop-blur-sm rounded-3xl border border-stone-200/80 shadow-sm space-y-3 hover:shadow-md hover:border-orange-200 transition-all duration-200 animate-fade-in-up"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-orange-600" />
                    <span>{occ.station?.station_name || 'Station'}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1">
                    <User className="w-3 h-3 text-stone-400" />
                    <span>Officer: {occ.officer?.full_name} ({occ.officer?.staff_id || 'SEC'})</span>
                  </div>
                </div>

                <span className="text-[11px] text-stone-400 flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatGhanaDateTime(occ.occurrence_time)}
                </span>
              </div>

              <div className="p-3.5 bg-stone-50/80 rounded-2xl border border-stone-200/50 text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
                {occ.description}
              </div>

              {occ.evidence && occ.evidence.length > 0 && (
                <div className="pt-1 flex flex-wrap gap-2">
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
