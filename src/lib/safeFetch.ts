/**
 * Safe fetch utility that prevents "Unexpected token '<', "<!doctype "... is not valid JSON" errors
 * by checking content-type and inspecting the response text before parsing as JSON.
 */

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isHtml?: boolean;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    const isHtml =
      contentType.includes('text/html') ||
      text.trim().startsWith('<!DOCTYPE') ||
      text.trim().startsWith('<!doctype') ||
      text.trim().startsWith('<html') ||
      text.trim().startsWith('<');

    if (isHtml) {
      return {
        ok: false,
        status: res.status,
        isHtml: true,
        error: `Server responded with HTML page (HTTP ${res.status}) instead of JSON API response.`,
      };
    }

    if (!text.trim()) {
      return {
        ok: res.ok,
        status: res.status,
        data: {} as T,
      };
    }

    try {
      const data = JSON.parse(text);
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          data,
          error: data?.error || data?.message || `Request failed with status ${res.status}`,
        };
      }
      return {
        ok: true,
        status: res.status,
        data,
      };
    } catch {
      return {
        ok: false,
        status: res.status,
        error: `Response from server was not valid JSON format (HTTP ${res.status})`,
      };
    }
  } catch (netErr: any) {
    return {
      ok: false,
      status: 0,
      error: netErr.message || 'Network communication error',
    };
  }
}

/**
 * Humanizes raw JSON / HTML parser errors into helpful user messages
 */
export function sanitizeErrorMessage(err: any, fallback = 'Operation failed'): string {
  if (!err) return fallback;
  const msg = typeof err === 'string' ? err : err.message || fallback;

  if (
    msg.includes("Unexpected token '<'") ||
    msg.includes('<!doctype') ||
    msg.includes('<!DOCTYPE') ||
    msg.includes('is not valid JSON')
  ) {
    return 'The backend service returned a web page (HTML) instead of a JSON response. Please ensure your Supabase Project URL is correctly configured (e.g., https://your-project.supabase.co) and not pointing to the app itself.';
  }

  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('TypeError')) {
    return 'Unable to reach the server. Your Supabase project may be paused. Please visit https://supabase.com/dashboard to unpause it, then try again.';
  }

  return msg;
}
