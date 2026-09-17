/**
 * Timezone and duty calculations for Security OMS
 * Operational timezone: Africa/Accra (Ghana local time, UTC+0)
 */

export const GHANA_TIMEZONE = 'Africa/Accra';

/**
 * Formats an ISO string or Date into Ghana local time (HH:mm:ss AM/PM)
 */
export function formatGhanaTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: GHANA_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO string or Date into Ghana short time (e.g., 6:00 PM)
 */
export function formatGhanaShortTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: GHANA_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO string or Date into Ghana date and time (e.g., 16 Sep 2026, 06:00 PM)
 */
export function formatGhanaDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: GHANA_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Formats date only (e.g., 16 Sep 2026)
 */
export function formatGhanaDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '—';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: GHANA_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

/**
 * Calculate expected 12-hour duty end time (started_at + 12 hours)
 */
export function calculateDutyEndTime(startedAt: string | Date): Date {
  const start = typeof startedAt === 'string' ? new Date(startedAt) : new Date(startedAt);
  return new Date(start.getTime() + 12 * 60 * 60 * 1000);
}

/**
 * Calculate remaining seconds from expected end time
 */
export function calculateRemainingSeconds(expectedEndAt: string | Date | null | undefined): number {
  if (!expectedEndAt) return 0;
  const end = typeof expectedEndAt === 'string' ? new Date(expectedEndAt).getTime() : expectedEndAt.getTime();
  const now = Date.now();
  const remaining = Math.floor((end - now) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Formats seconds into HH:MM:SS
 */
export function formatSecondsCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
