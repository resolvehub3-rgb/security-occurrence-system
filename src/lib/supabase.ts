import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sanitizeErrorMessage } from './safeFetch';

/**
 * Validates whether a given URL is the app's own web preview address rather than Supabase
 */
export function isAppSelfUrl(url: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(clean);
      if (parsed.host === window.location.host || parsed.origin === window.location.origin) {
        return true;
      }
    } catch {
      // Invalid URL
    }
  }
  if (clean.includes('.run.app') || clean.includes('localhost:3000') || clean.includes('127.0.0.1:3000')) {
    return true;
  }
  return false;
}

export function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  isConfigured: boolean;
  configError?: string;
} {
  const url = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const serviceRoleKey = ((import.meta.env as any).VITE_SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (url && isAppSelfUrl(url)) {
    return {
      url,
      anonKey,
      serviceRoleKey,
      isConfigured: false,
      configError:
        'The configured Supabase URL is pointing to this web application instead of your Supabase project.',
    };
  }

  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    anonKey.length > 20 &&
    !isAppSelfUrl(url)
  );

  return { url, anonKey, serviceRoleKey, isConfigured };
}

/**
 * Rewrites any Supabase URL to go through the local server proxy.
 * E.g. https://xyz.supabase.co/auth/v1/token -> /api/supabase-proxy/auth/v1/token
 *      https://xyz.supabase.co/rest/v1/profiles -> /api/supabase-proxy/rest/v1/profiles
 */
function proxyUrl(supabaseUrl: string, originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  const cleanSupabase = supabaseUrl.replace(/\/+$/, '');
  if (originalUrl.startsWith(cleanSupabase)) {
    const path = originalUrl.slice(cleanSupabase.length + 1); // +1 for the trailing /
    return `/api/supabase-proxy/${path}`;
  }
  return originalUrl;
}

let clientInstance: SupabaseClient | null = null;
let currentUrl: string = '';
let currentKey: string = '';

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
}

export function getSupabase(): SupabaseClient {
  const config = getSupabaseConfig();

  if (!config.isConfigured) {
    if (!clientInstance) {
      clientInstance = createClient(
        'https://placeholder-project.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder-anon-key-that-is-safe-for-unconfigured-state.placeholder',
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      );
    }
    return clientInstance;
  }

  if (!clientInstance || currentUrl !== config.url || currentKey !== config.anonKey) {
    currentUrl = config.url;
    currentKey = config.anonKey;

    const supabaseUrl = config.url;
    const supabaseAnonKey = config.anonKey;

    // Only route through server proxy on localhost (Express server is running)
    // On deployed environments (Vercel, etc.), talk directly to Supabase
    if (isLocalhost()) {
      const proxyFetch: typeof fetch = async (input, init) => {
        const originalUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        const rewritten = proxyUrl(supabaseUrl, originalUrl);

        const newInit = { ...init };
        const newHeaders = new Headers(init?.headers);
        newHeaders.set('apikey', supabaseAnonKey);
        if (!newHeaders.has('Authorization')) {
          newHeaders.set('Authorization', `Bearer ${supabaseAnonKey}`);
        }
        newInit.headers = newHeaders;

        return fetch(rewritten, newInit);
      };

      clientInstance = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          fetch: proxyFetch,
        },
        global: {
          fetch: proxyFetch,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    } else {
      // Production: talk directly to Supabase
      clientInstance = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    }
  }

  return clientInstance;
}

/**
 * Save Supabase config to server only (no localStorage)
 * On deployed environments (Vercel), config is baked in at build time — this is a no-op.
 */
export async function saveSupabaseConfig(url: string, anonKey: string, serviceRoleKey?: string): Promise<void> {
  if (!isLocalhost()) return;
  try {
    await fetch('/api/admin/configure-supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey ? serviceRoleKey.trim() : undefined,
      }),
    });
    clientInstance = null;
  } catch {
    // Ignore background sync failure
  }
}

/**
 * Reset Supabase config on server (no localStorage)
 * On deployed environments (Vercel), config is baked in at build time — this is a no-op.
 */
export async function clearSupabaseConfig(): Promise<void> {
  if (!isLocalhost()) return;
  try {
    await fetch('/api/admin/configure-supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
    });
    clientInstance = null;
  } catch {}
}

/**
 * Upload an evidence file to Supabase Storage bucket 'occurrence-evidence'
 */
export async function uploadEvidenceFile(
  file: File,
  occurrenceId: string,
  officerId: string
): Promise<{ storagePath: string; publicUrl: string; fileName: string; fileType: string; fileSize: number }> {
  const supabase = getSupabase();
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const cleanBaseName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueTimestamp = Date.now();
  const storagePath = `${officerId}/${occurrenceId}/${uniqueTimestamp}_${cleanBaseName}`;

  const { error: uploadError } = await supabase.storage
    .from('occurrence-evidence')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Evidence upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('occurrence-evidence')
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData.publicUrl,
    fileName: file.name,
    fileType: file.type || `application/${fileExt}`,
    fileSize: file.size,
  };
}

/**
 * Test Supabase connection — uses proxy on localhost, direct on deployed
 */
export async function testSupabaseConnection(url?: string, key?: string): Promise<{ success: boolean; message: string }> {
  try {
    const testUrl = (url || getSupabaseConfig().url || '').trim();
    const testKey = (key || getSupabaseConfig().anonKey || '').trim();

    if (!testUrl || !testKey) {
      return { success: false, message: 'URL and Key cannot be empty.' };
    }

    if (isAppSelfUrl(testUrl)) {
      return {
        success: false,
        message: 'Invalid Supabase URL: You entered the web application preview URL.',
      };
    }

    const testApiUrl = isLocalhost()
      ? `/api/supabase-proxy/rest/v1/profiles?select=id&limit=1`
      : `${testUrl.replace(/\/+$/, '')}/rest/v1/profiles?select=id&limit=1`;

    const res = await fetch(testApiUrl, {
      headers: {
        apikey: testKey,
        Authorization: `Bearer ${testKey}`,
      },
    });

    if (res.ok) {
      return { success: true, message: 'Connected to Supabase successfully!' };
    }

    const body = await res.text();
    if (body.includes('42P01') || body.includes('does not exist')) {
      return {
        success: true,
        message: 'Connected to Supabase! Database tables not created yet. Run the SQL migration script.',
      };
    }

    return { success: false, message: `Connection test failed (HTTP ${res.status}): ${body}` };
  } catch (err: any) {
    return { success: false, message: sanitizeErrorMessage(err, 'Connection failed') };
  }
}
