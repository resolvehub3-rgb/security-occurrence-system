import React, { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../lib/supabase';
import { AuditLog } from '../../types';
import { formatGhanaDateTime } from '../../utils/timezone';
import { ShieldCheck, Clock, User, FileText, Search } from 'lucide-react';
import { EmptyState } from '../common/EmptyState';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          actor:profiles!audit_logs_actor_user_id_fkey(*)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) console.error('Error fetching audit logs:', error);
      setLogs((data as AuditLog[]) || []);
    } catch (err) {
      console.error('Audit logs load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();

    const supabase = getSupabase();
    const channel = supabase
      .channel('admin-audit-logs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLogs]);

  const filtered = logs.filter((log) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      log.action.toLowerCase().includes(q) ||
      log.entity_type.toLowerCase().includes(q) ||
      log.actor?.full_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">System Audit Trail</h1>
          <p className="text-xs text-stone-500">Immutable chronological log of administrative and operational actions</p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search action, actor, entity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-56 sm:w-72"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-400">Loading audit logs…</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No Audit Logs Recorded"
          description="System actions such as station creations, user status changes, and report sign-offs will be tracked here."
        />
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50 text-[11px] uppercase font-bold text-stone-400 border-b border-stone-100">
                <tr>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Entity Type</th>
                  <th className="py-3.5 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50/60 transition">
                    <td className="py-3 px-4 text-stone-500 font-mono text-[11px]">
                      {formatGhanaDateTime(log.created_at)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-stone-900">
                      {log.actor?.full_name || 'System'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-orange-50 text-orange-700 border border-orange-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-600 font-mono">{log.entity_type}</td>
                    <td className="py-3 px-4 text-stone-500 font-mono text-[11px] max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
