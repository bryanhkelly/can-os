import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";

/** Shared event formatting for all calendar surfaces. */
export function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }
}

export function formatEventDate(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  }
}

export function typeLabel(item: CalendarFeedItem): string {
  if (item.source === "assessment") return "Due";
  if (item.source === "personal") return "Personal";
  if (item.source === "study_group") return "Study group";
  if (item.type === "class_time") return "Class time";
  if (item.type === "chapel") return "Chapel";
  if (item.type === "field_trip") return "Field trip";
  if (item.source === "section") return "Section";
  return "School";
}

export function chipClass(): string {
  return "border-border bg-muted text-primary";
}
