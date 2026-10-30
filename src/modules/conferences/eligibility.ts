/**
 * Pure eligibility decisions for conference slot booking. Kept free of db and
 * request concerns so both the domain command and unit tests can use them.
 */

export type ConferenceWindow = {
  seriesStatus: string;
  startsAt: Date;
  now?: Date;
};

export type ConferenceWindowProblem = "series_not_published" | "slot_in_past";

/**
 * A slot is bookable only while its series is published and the slot starts
 * in the future. Returns the first problem found, or null when bookable.
 */
export function conferenceWindowProblem(
  window: ConferenceWindow,
): ConferenceWindowProblem | null {
  if (window.seriesStatus !== "published") return "series_not_published";
  if (window.startsAt <= (window.now ?? new Date())) return "slot_in_past";
  return null;
}
