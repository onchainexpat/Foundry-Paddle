import { EVENT_TYPE_ORDER } from "@/constants/events";
import { PLAYTOMIC_TENANT_URL } from "@/constants/booking";
import type { PadelEvent } from "@/types/events";

/** "13:00" -> "01:00 PM" */
export function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} ${period}`;
}

/** Group events by their YYYY-MM-DD date. Input is assumed already sorted by
 *  date then start time (the API returns it that way), so each day's array
 *  preserves chronological order. */
export function groupEventsByDate(events: PadelEvent[]): Map<string, PadelEvent[]> {
  const map = new Map<string, PadelEvent[]>();
  for (const e of events) {
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  return map;
}

/** Where the BOOK button should point for a given event.
 *  Playtomic exposes tournaments as public per-item pages (registration), so we
 *  deep-link those by their id (which is the tournament_id). Open matches and
 *  classes are app/login-gated on Playtomic with no public per-item URL, so
 *  those fall back to the club's tenant page. */
export function eventBookingUrl(event: PadelEvent): string {
  if (event.booking_type === "TOURNAMENT" && event.id) {
    return `https://app.playtomic.io/tournaments/${event.id}`;
  }
  return PLAYTOMIC_TENANT_URL;
}

/** Sort booking types into a stable display order; unknown types go last. */
export function sortTypesByOrder(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const ia = EVENT_TYPE_ORDER.indexOf(a);
    const ib = EVENT_TYPE_ORDER.indexOf(b);
    return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
  });
}
