// Elapsed match time is never stored server-side - every viewer (admin console,
// fan match detail) derives it locally from period + periodStartedAt, so a 1s
// re-render tick is all that's needed to keep the clock live in sync with the
// server's transition timestamps. Mirrors computeElapsedMinuteServer in
// apps/api/src/matches-db.mjs (used there only to timestamp system events).
export function computeElapsedSeconds(
  period: string,
  periodStartedAt: string,
  halfLengthMinutes: number,
  now: number = Date.now()
): number {
  const halfLengthSeconds = halfLengthMinutes * 60;
  if (period === "halftime") return halfLengthSeconds;
  if (period === "first_half" && periodStartedAt) {
    const elapsed = Math.floor((now - new Date(periodStartedAt).getTime()) / 1000);
    return Math.min(halfLengthSeconds, Math.max(0, elapsed));
  }
  if (period === "second_half" && periodStartedAt) {
    const elapsed = Math.floor((now - new Date(periodStartedAt).getTime()) / 1000);
    return halfLengthSeconds + Math.max(0, elapsed);
  }
  return 0;
}

export function computeElapsedMinute(period: string, periodStartedAt: string, halfLengthMinutes: number, now: number = Date.now()): number {
  return Math.floor(computeElapsedSeconds(period, periodStartedAt, halfLengthMinutes, now) / 60);
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  if (period === "first_half") return "1. poluvreme";
  if (period === "halftime") return "Poluvreme";
  if (period === "second_half") return "2. poluvreme";
  if (period === "finished") return "Zavrseno";
  return "Nije poceto";
}
