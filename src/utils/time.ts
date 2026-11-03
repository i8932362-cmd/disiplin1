/**
 * Time synchronization and clock offset calculation
 * Guarantees server-authoritative time on all devices
 */

let clockOffsetMs = 0; // serverTime - localDeviceTime

export function setServerClockOffset(serverTimeIso: string) {
  try {
    const serverTimeMs = new Date(serverTimeIso).getTime();
    const localNowMs = Date.now();
    clockOffsetMs = serverTimeMs - localNowMs;
  } catch (e) {
    // Keep 0 offset on parse failure
  }
}

/**
 * Returns current Date object synchronized with the server's clock
 */
export function getServerNow(): Date {
  return new Date(Date.now() + clockOffsetMs);
}

/**
 * Format server time as HH:mm:ss
 */
export function formatServerTime(date: Date = getServerNow()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Format date in Indonesian locale (e.g. "Jumat, 30 Oktober 2026")
 */
export function formatIndonesianDate(date: Date = getServerNow()): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Calculates remaining seconds from now until dueTimeIso
 */
export function calculateRemainingSeconds(dueTimeIso: string): number {
  const dueMs = new Date(dueTimeIso).getTime();
  const nowMs = getServerNow().getTime();
  return Math.max(0, Math.floor((dueMs - nowMs) / 1000));
}

/**
 * Calculates overdue seconds if now > dueTimeIso
 */
export function calculateOverdueSeconds(dueTimeIso: string): number {
  const dueMs = new Date(dueTimeIso).getTime();
  const nowMs = getServerNow().getTime();
  return Math.max(0, Math.floor((nowMs - dueMs) / 1000));
}

/**
 * Formats seconds as MM:SS
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
