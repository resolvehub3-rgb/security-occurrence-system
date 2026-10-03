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

/** Official duty period ends at 7:30 AM Ghana time (UTC+0) */
export const DUTY_END_HOUR = 7;
export const DUTY_END_MINUTE = 30;

/**
 * Officers keep access for this many minutes after the duty period ends so they
 * can submit the final report (7:30 AM → 8:00 AM).
 */
export const SUBMISSION_GRACE_MINUTES = 30;

/**
 * Calculate the fixed end of the duty period — the next 7:30 AM Ghana time.
 *
 * The countdown is anchored to the official schedule, NOT to the moment the
 * officer clicks "Report On Duty". An officer reporting late at 6:30 PM still
 * sees the time left until 7:30 AM (13:00:00), not 12 hours from his click.
 *
 * Ghana (Africa/Accra) is UTC+0, so UTC arithmetic equals Ghana local time.
 */
export function calculateDutyEndTime(reference: string | Date = new Date()): Date {
  const ref = typeof reference === 'string' ? new Date(reference) : new Date(reference);
  const refTime = ref.getTime();
  const now = isNaN(refTime) ? new Date() : ref;

  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      DUTY_END_HOUR,
      DUTY_END_MINUTE,
      0,
      0
    )
  );

  // Reference time already past today's 7:30 AM → duty ends tomorrow at 7:30 AM
  if (end.getTime() <= now.getTime()) {
    end.setUTCDate(end.getUTCDate() + 1);
  }

  return end;
}

/**
 * True once the duty period AND its submission grace window have both passed,
 * i.e. the session can no longer be closed and a new shift should be reported.
 */
export function isPastSubmissionGrace(
  expectedEndAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expectedEndAt) return false;
  const end =
    typeof expectedEndAt === 'string'
      ? new Date(expectedEndAt).getTime()
      : expectedEndAt.getTime();
  if (isNaN(end)) return false;
  return now.getTime() > end + SUBMISSION_GRACE_MINUTES * 60 * 1000;
}

/**
 * True while officers are inside the post-shift submission grace period
 * (7:30 AM – 8:00 AM Ghana time) — the only time outside the normal duty
 * window when an officer with a just-ended shift may still access the portal.
 */
export function isSubmissionGraceWindow(): boolean {
  const gh = getGhanaNow();
  const closeMinutes = DUTY_END_HOUR * 60 + DUTY_END_MINUTE; // 7:30 AM
  return gh.totalMinutes >= closeMinutes && gh.totalMinutes < closeMinutes + SUBMISSION_GRACE_MINUTES;
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

/**
 * Get current Ghana time components (Ghana is UTC+0, no DST)
 */
export function getGhanaNow(): { hours: number; minutes: number; seconds: number; totalMinutes: number } {
  const now = new Date();
  // Ghana is UTC+0 — directly use UTC values
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  return { hours, minutes, seconds, totalMinutes: hours * 60 + minutes };
}

/**
 * Officer duty window: 5:00 PM – 7:30 AM Ghana time (overnight)
 * Returns { allowed, nextChange, message }
 *
 * @param options.withinSubmissionGrace Set by OfficerLayout when the officer has
 *   a duty session that just ended and is still inside the 7:30 AM – 8:00 AM
 *   submission grace window. Grants access only so the final report can be closed.
 */
export function getOfficerAccessStatus(options?: {
  withinSubmissionGrace?: boolean;
}): {
  allowed: boolean;
  nextChangeSeconds: number;
  message: string;
} {
  const gh = getGhanaNow();
  const OPEN_MINUTES = 17 * 60; // 5:00 PM = 1020
  const CLOSE_MINUTES = 7 * 60 + 30; // 7:30 AM = 450

  const isWithinWindow = gh.totalMinutes >= OPEN_MINUTES || gh.totalMinutes < CLOSE_MINUTES;

  if (isWithinWindow) {
    // Within allowed window — calculate time until 7:30 AM
    let minutesUntilClose: number;
    if (gh.totalMinutes >= OPEN_MINUTES) {
      // After 5:00 PM — time until 7:30 AM tomorrow
      minutesUntilClose = (24 * 60 - gh.totalMinutes) + CLOSE_MINUTES;
    } else {
      // Before 7:30 AM — time until 7:30 AM today
      minutesUntilClose = CLOSE_MINUTES - gh.totalMinutes;
    }
    const nextChangeSeconds = minutesUntilClose * 60 - gh.seconds;
    return {
      allowed: true,
      nextChangeSeconds,
      message: `Duty window open. Access closes at 7:30 AM.`,
    };
  }

  // Outside the duty window — a short grace period (7:30 AM – 8:00 AM) is granted
  // to officers whose shift just ended so they can submit the final report.
  if (options?.withinSubmissionGrace) {
    const graceCloseMinutes = CLOSE_MINUTES + SUBMISSION_GRACE_MINUTES; // 8:00 AM
    if (gh.totalMinutes < graceCloseMinutes) {
      const nextChangeSeconds = (graceCloseMinutes - gh.totalMinutes) * 60 - gh.seconds;
      return {
        allowed: true,
        nextChangeSeconds: nextChangeSeconds > 0 ? nextChangeSeconds : 0,
        message: `Duty window closed. Final report pending — access open until 8:00 AM.`,
      };
    }
  }

  // Outside window — calculate time until 5:00 PM
  const minutesUntilOpen = OPEN_MINUTES - gh.totalMinutes;
  const nextChangeSeconds = minutesUntilOpen * 60 - gh.seconds;

  return {
    allowed: false,
    nextChangeSeconds,
    message: `Duty window closed. Access opens at 5:00 PM.`,
  };
}
