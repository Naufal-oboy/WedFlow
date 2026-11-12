export type AttendanceSummary = {
  invitations: number;
  capacity: number;
  attendees: number;
  remaining: number;
  arrivedInvitations: number;
  percentage: number;
  latestCheckinAt: string | null;
};
export type AttendanceSnapshot = {
  event: { name: string; status: string; timeZone: string };
  summary: AttendanceSummary;
  activity: { id: string; guestName: string; count: number; method: string; legacy: boolean; createdAt: string; staffName: string | null }[];
  timeline: { intervalMinutes: number; buckets: { start: string; count: number }[] };
  refreshedAt: string;
};

export function attendanceMetrics(invitations: number, capacity: number, attendees: number, arrivedInvitations: number, latestCheckinAt: Date | null): AttendanceSummary {
  return { invitations, capacity, attendees, arrivedInvitations, remaining: Math.max(0, capacity - attendees), percentage: capacity > 0 ? attendees / capacity * 100 : 0, latestCheckinAt: latestCheckinAt?.toISOString() ?? null };
}

// Absolute elapsed-time buckets avoid merging repeated local hours at DST changes.
// Widen in multiples of 15 minutes for long events; at most 97 buckets.
export function timelineInterval(first: Date, last: Date) {
  return Math.max(1, Math.ceil((last.getTime() - first.getTime() + 1) / (96 * 900_000))) * 15;
}
export function fillTimeline(rows: { start: Date; count: number }[], minutes: number) {
  if (!rows.length) return [];
  const counts = new Map(rows.map(row => [row.start.getTime(), row.count]));
  const buckets: { start: string; count: number }[] = [];
  for (let time = rows[0].start.getTime(); time <= rows[rows.length - 1].start.getTime(); time += minutes * 60_000) {
    buckets.push({ start: new Date(time).toISOString(), count: counts.get(time) ?? 0 });
  }
  return buckets;
}
export function attendanceTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone, timeZoneName: "shortOffset" }).format(new Date(value));
}
