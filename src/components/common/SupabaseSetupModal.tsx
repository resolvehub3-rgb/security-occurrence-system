import React, { useState, useEffect } from 'react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
  isAppSelfUrl,
} from '../../lib/supabase';
import { Database, Check, Copy, RefreshCw, AlertTriangle, ShieldCheck, X, ExternalLink } from 'lucide-react';

function isDeployed(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0';
}

const SQL_MIGRATION_PREVIEW = `-- 1. Run in Supabase SQL Editor:
-- Extends Supabase auth.users with operational roles & metadata
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'officer')),
    staff_id TEXT,
    phone TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. STATIONS TABLE
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_name TEXT NOT NULL,
    station_code TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. STATION OFFICERS TABLE
CREATE TABLE IF NOT EXISTS public.station_officers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(station_id, officer_id)
);

-- 4. DUTY SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.duty_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    duty_date DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_end_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'submitted', 'returned', 'finalized')),
    final_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OCCURRENCES TABLE
CREATE TABLE IF NOT EXISTS public.occurrences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    duty_session_id UUID NOT NULL REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    occurrence_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'reviewed', 'flagged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. OCCURRENCE EVIDENCE TABLE
CREATE TABLE IF NOT EXISTS public.occurrence_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    occurrence_id UUID NOT NULL REFERENCES public.occurrences(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    public_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. DUTY REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.duty_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    duty_session_id UUID NOT NULL UNIQUE REFERENCES public.duty_sessions(id) ON DELETE CASCADE,
    officer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    officer_submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    manager_reviewed_at TIMESTAMPTZ,
    manager_approved_at TIMESTAMPTZ,
    manager_submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'returned', 'finalized')),
    manager_comments TEXT,
    correction_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_entity_id UUID,
    related_entity_type TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. REALTIME ENABLE
ALTER PUBLICATION supabase_realtime ADD TABLE public.duty_sessions, public.occurrences, public.duty_reports, public.notifications, public.stations, public.profiles;

-- 11. STATIONS ROW LEVEL SECURITY (Permissive for authenticated security staff)
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stations viewable by authenticated users" ON public.stations;
CREATE POLICY "Stations viewable by authenticated users" ON public.stations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage stations" ON public.stations;
CREATE POLICY "Admins can manage stations" ON public.stations FOR ALL TO authenticated USING (true) WITH CHECK (true);`;

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose, onConfigSaved }) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [activeTab, setActiveTab] = useState<'credentials' | 'schema'>('credentials');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getSupabaseConfig();
      setUrl(cfg.url);
      setAnonKey(cfg.anonKey);
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testSupabaseConnection(url, anonKey);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = async () => {
    await saveSupabaseConfig(url, anonKey);
    if (onConfigSaved) onConfigSaved();
    onClose();
    window.location.reload();
  };

  const handleReset = async () => {
    await clearSupabaseConfig();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_PREVIEW);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden my-8 animate-fade-in">
        {/* Header */}
        <div className="bg-stone-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Supabase Backend Configuration</h2>
              <p className="text-xs text-stone-400">Production PostgreSQL & Realtime Backend</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-stone-200 bg-stone-50 px-5 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('credentials')}
            className={`pb-3 text-xs font-semibold border-b-2 transition ${
              activeTab === 'credentials'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            Connection Settings
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'schema'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>SQL Migration Script</span>
            <span className="px-1.5 py-0.2 rounded-sm bg-orange-100 text-orange-700 text-[10px] font-bold">Ready</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'credentials' ? (
            <div className="space-y-4">
              {isDeployed() && (
                <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Deployed Environment:</strong> The "Save & Connect" button does not work on deployed builds (Vercel, Netlify, etc.). Environment variables are baked in at build time. To configure Supabase, set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your hosting dashboard, then <strong>redeploy</strong>.
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-orange-50/80 border border-orange-200/80 rounded-xl text-xs text-orange-900 leading-relaxed">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Production Supabase Rule:</strong> All authentication, duty sessions, occurrences, reports, and notifications run directly against your Supabase instance. No fake or mock data is permitted.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-project-id.supabase.co"
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border focus:outline-none focus:ring-2 font-mono text-xs ${
                    isAppSelfUrl(url)
                      ? 'border-rose-400 bg-rose-50/50 focus:ring-rose-500 focus:border-rose-500 text-rose-900'
                      : 'border-stone-300 focus:ring-orange-500 focus:border-orange-500'
                  }`}
                />
                {isAppSelfUrl(url) && (
                  <p className="mt-1.5 text-xs text-rose-600 flex items-start gap-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>
                      Notice: You entered the web app URL. Please use your Supabase project URL (format: <code>https://your-project.supabase.co</code>) to avoid HTML JSON errors.
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Supabase Anon Key (Public Key)
                </label>
                <textarea
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  rows={3}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono"
                />
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {testResult.success ? (
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div>{testResult.message}</div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isDeployed()}
                  className="px-3.5 py-2 text-xs font-medium text-stone-500 hover:text-stone-800 transition disabled:opacity-50"
                >
                  Clear Overrides
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing || !url || !anonKey || isAppSelfUrl(url)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                    <span>Test Connection</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!url || !anonKey || isAppSelfUrl(url) || isDeployed()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition shadow-sm"
                    title={isDeployed() ? 'Set env vars in hosting dashboard, then redeploy' : ''}
                  >
                    <Check className="w-4 h-4" />
                    <span>{isDeployed() ? 'Set in Dashboard' : 'Save & Connect'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-stone-600">
                  Execute this SQL in your <strong>Supabase Dashboard → SQL Editor</strong> to create all tables, indexes, RLS policies, and enable Realtime.
                </p>
                <button
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy SQL'}</span>
                </button>
              </div>

              <div className="relative rounded-xl border border-stone-200 bg-stone-900 text-stone-200 p-4 font-mono text-[11px] overflow-x-auto max-h-72">
                <pre>{SQL_MIGRATION_PREVIEW}</pre>
              </div>

              <div className="text-[11px] text-stone-500 flex items-center justify-between pt-1">
                <span>The full migration file is also saved at: <code>/supabase/migrations/20260916_init_schema.sql</code></span>
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-orange-600 hover:underline font-medium"
                >
                  Open Supabase <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
