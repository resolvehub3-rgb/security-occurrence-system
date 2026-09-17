import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseConfig, clearSupabaseConfig } from '../../lib/supabase';
import {
  Shield,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';

export const Login: React.FC = () => {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const handleDiagnostics = async () => {
    setDiagnosing(true);
    setError(null);
    const config = getSupabaseConfig();
    const results: string[] = [];

    results.push(`Supabase URL: ${config.url || '(not set)'}`);
    results.push(`Anon Key: ${config.anonKey ? config.anonKey.substring(0, 20) + '...' : '(not set)'}`);
    results.push(`Configured: ${config.isConfigured}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`${config.url}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: config.anonKey },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      results.push(`Network test: HTTP ${resp.status} - ${resp.ok ? 'REACHABLE' : 'UNREACHABLE'}`);
    } catch (e: any) {
      results.push(`Network test: FAILED - ${e.message || 'Cannot reach Supabase server from this browser'}`);
    }

    const diagnostic = results.join('\n');
    console.log('[Login Diagnostic]\n', diagnostic);
    setError(`DIAGNOSTIC RESULTS:\n${diagnostic}\n\nIf Network test FAILED, try: Disable browser extensions, use Incognito mode, or check your firewall.`);
    setDiagnosing(false);
  };

  const handleResetConnection = async () => {
    await clearSupabaseConfig();
    window.location.reload();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your credentials to proceed.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await signIn(email, password);
    if (!res.success) {
      setError(res.error || 'Invalid credentials. Please verify and try again.');
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center px-4 py-12 relative"
      style={{
        backgroundImage: 'url(/auth-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-stone-900/50" />

      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Portal Branding Card */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 w-20 h-20 rounded-3xl bg-orange-400/20 blur-lg animate-pulse" />
            <div className="relative w-20 h-20 rounded-3xl bg-white shadow-xl shadow-orange-600/15 border border-orange-100 flex items-center justify-center">
              <img
                src="/logo.png"
                alt="Security OMS"
                className="w-14 h-14 object-contain drop-shadow-sm"
              />
            </div>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-lg">
            SECURITY <span className="text-orange-400">OCCURRENCE</span>
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/70 mt-1 drop-shadow">
            Operational Management Portal
          </p>
        </div>

        {/* Auth Box */}
        <div className="bg-white rounded-3xl border border-stone-200/90 p-8 shadow-sm space-y-6">
          <div className="pb-4 border-b border-stone-100">
            <h2 className="text-base font-bold text-stone-900">
              Terminal Sign In
            </h2>
            <p className="text-xs text-stone-500">
              Authorized personnel authentication
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 whitespace-pre-wrap">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="leading-snug">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-stone-700 mb-1.5">Operational Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="officer@domain.com or admin@domain.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block font-semibold text-stone-700">Password</label>
                <span className="text-[10px] text-stone-400">Encrypted</span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              id="login-submit-btn"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <span>Access Security Terminal</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Security Notice */}
        <p className="text-center text-[11px] text-white/70 mt-6 leading-relaxed">
          Authorized security officers, station managers, and administrators only.
          <br />
          All actions are timestamped and recorded in the immutable audit logbook.
        </p>
      </div>
    </div>
  );
};
