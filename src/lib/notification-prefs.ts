// Shared notification-preference types and quiet-hours evaluation.
// Works on both client and server (no DOM or Node-only APIs).

export interface NotificationPrefs {
  dm_push_enabled: boolean;
  dm_inapp_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_start: string; // "HH:MM"
  quiet_end: string; // "HH:MM"
  timezone: string; // IANA, e.g. "America/New_York"
}

export const DEFAULT_PREFS: NotificationPrefs = {
  dm_push_enabled: true,
  dm_inapp_enabled: true,
  quiet_hours_enabled: false,
  quiet_start: "22:00",
  quiet_end: "07:00",
  timezone: "UTC",
};

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Returns the wall-clock minutes (0-1439) for `now` in the given IANA timezone.
 * Falls back to UTC if the zone is invalid.
 */
function minutesInZone(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return ((h % 24) * 60 + m) % (24 * 60);
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** True when `now` falls inside the user's configured quiet hours window. */
export function isInQuietHours(prefs: NotificationPrefs, now: Date = new Date()): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  const start = parseHHMM(prefs.quiet_start);
  const end = parseHHMM(prefs.quiet_end);
  if (start === null || end === null || start === end) return false;
  const nowMin = minutesInZone(now, prefs.timezone);
  // Window doesn't cross midnight.
  if (start < end) return nowMin >= start && nowMin < end;
  // Window crosses midnight (e.g. 22:00 -> 07:00).
  return nowMin >= start || nowMin < end;
}
