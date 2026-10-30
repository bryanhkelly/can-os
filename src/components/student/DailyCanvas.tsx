import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Editorial content never grants permission or replaces an authoritative safety notice. */
export type DailyCanvasPriority =
  | "emergency" | "required" | "local" | "network" | "seasonal" | "editorial" | "default";

export interface DailyCanvasContent {
  id: string;
  priority: DailyCanvasPriority;
  audience: "student" | "guardian" | "teacher" | "site";
  headline: string;
  supportingCopy?: string;
  campaignLabel?: string;
  verseText?: string;
  verseReference?: string;
  backgroundImage?: string;
  source?: string;
  startsAt?: string;
  endsAt?: string;
}

const precedence: Record<DailyCanvasPriority, number> = {
  emergency: 0, required: 1, local: 2, network: 3,
  seasonal: 4, editorial: 5, default: 6,
};

/** Filters by audience and time, then picks the highest-priority eligible content. */
export function selectDailyCanvasContent(
  entries: readonly DailyCanvasContent[],
  audience: DailyCanvasContent["audience"],
  now: Date,
): DailyCanvasContent | null {
  const timestamp = now.getTime();
  return entries.filter(item => item.audience === audience
    && (!item.startsAt || Date.parse(item.startsAt) <= timestamp)
    && (!item.endsAt || Date.parse(item.endsAt) > timestamp)
    && (!item.startsAt || Number.isFinite(Date.parse(item.startsAt)))
    && (!item.endsAt || Number.isFinite(Date.parse(item.endsAt))))
    .sort((a, b) => precedence[a.priority] - precedence[b.priority]
      || (Date.parse(b.startsAt ?? "") || 0) - (Date.parse(a.startsAt ?? "") || 0)
      || a.id.localeCompare(b.id))[0] ?? null;
}

export function DailyCanvas({ content, audience, operationalSummary, primaryAction, secondaryAction, className }: {
  content: DailyCanvasContent | null;
  audience: DailyCanvasContent["audience"];
  operationalSummary?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  const safety = content?.priority === "emergency";
  return <section aria-label={safety ? "Urgent school notice" : "Your day"} className={cn(
    "student-day-hero relative isolate overflow-hidden rounded-3xl border border-white/15 px-6 py-9 text-white shadow-xl sm:px-10 sm:py-12",
    safety && "border-red-300 bg-red-950", className,
  )}>
    {!safety && <div aria-hidden="true" className="student-day-hero-landscape absolute inset-0 -z-10" />}
    {content?.backgroundImage && !safety && <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(90deg,rgba(0,0,0,.65),rgba(0,0,0,.15)),url("${content.backgroundImage.replaceAll('"', '%22')}")` }} />}
    <div className="relative max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em]">{safety ? "Urgent school notice" : content?.campaignLabel ?? (audience === "student" ? "Your learning day" : "Your school day")}</p>
      <h2 className="mt-5 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">{content?.headline ?? "Make today count."}</h2>
      {content?.supportingCopy && <p className="mt-3 max-w-xl text-sm leading-7 text-white/90 sm:text-base">{content.supportingCopy}</p>}
      {content?.verseText && <blockquote className="mt-4 border-l-2 border-white/70 pl-4 text-sm italic">{content.verseText}{content.verseReference && <footer className="mt-1 text-xs not-italic">{content.verseReference}</footer>}</blockquote>}
      {operationalSummary && <div className="mt-5 text-sm font-medium text-white">{operationalSummary}</div>}
      {(primaryAction || secondaryAction) && <div className="mt-6 flex flex-wrap items-center gap-3">{primaryAction}{secondaryAction}</div>}
    </div>
  </section>;
}
