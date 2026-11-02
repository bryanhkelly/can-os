import { AttentionQueue } from "@/components/operations/AttentionQueue";
import { StatusBadge, WorkspacePanel } from "@/components/workspace";
import type { DailyAttentionItem } from "@/domain/daily-operations";

function exceptionSummary(count: number) {
  return count === 0 ? "No current exceptions" : `${count} to review`;
}

function priorityTone(priority: DailyAttentionItem["priority"]): "danger" | "attention" | "neutral" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "attention";
  return "neutral";
}

export function SiteTodayPriorities({
  items,
  siteId,
  siteTimezone,
  ownedActionIds,
  staffingExceptionCount,
  studentExceptionCount,
}: {
  items: readonly DailyAttentionItem[];
  siteId: string;
  siteTimezone: string;
  ownedActionIds: readonly string[];
  staffingExceptionCount: number;
  studentExceptionCount: number;
}) {
  const [nextAction, ...otherItems] = items;
  const nextActionHref = nextAction
    ? ownedActionIds.includes(nextAction.id)
      ? `/sites/${encodeURIComponent(siteId)}#site-owned-follow-ups`
      : nextAction.href
    : undefined;
  const formatDueDate = (date: string) => new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: siteTimezone,
  }).format(new Date(date));
  const signals = [
    {
      label: "Staffing",
      value: exceptionSummary(staffingExceptionCount),
      description: "Coverage, assignments and adult check-in",
      href: "#staffing-exceptions",
      link: "Review staffing",
    },
    {
      label: "Student attendance and follow-up",
      value: exceptionSummary(studentExceptionCount),
      description: "Attendance, explanations, health, incidents and dismissal",
      href: "#student-exceptions",
      link: "Review student exceptions",
    },
    {
      label: "Priority items",
      value: items.length === 0 ? "No open priorities" : `${items.length} open`,
      description: "Actions and source-derived follow-ups in your current scope",
      href: "#next-authorized-action",
      link: "Review next action",
    },
  ];

  return (
    <WorkspacePanel
      id="site-priorities"
      title="Today’s priorities"
      description="Start with the current authorized work, then review the source records below."
      className="mt-6"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {signals.map(signal => (
          <article key={signal.label} className="rounded-xl border bg-background p-4">
            <h3 className="text-sm font-semibold">{signal.label}</h3>
            <p className="mt-2 text-base font-semibold">{signal.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{signal.description}</p>
            <a className="mt-3 inline-block text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={signal.href}>
              {signal.link}
            </a>
          </article>
        ))}
      </div>

      {nextAction ? (
        <article id="next-authorized-action" className="mt-4 rounded-xl border-2 border-primary/30 bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Next authorized action
              </p>
              <h3 className="mt-1 text-lg font-semibold">{nextAction.title}</h3>
            </div>
            <StatusBadge tone={priorityTone(nextAction.priority)}>
              {nextAction.priority === "critical" ? "Critical" : nextAction.priority === "high" ? "High priority" : "Standard"}
            </StatusBadge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{nextAction.detail}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
              {nextAction.ownerName ? `Owner: ${nextAction.ownerName}` : "Owner: not assigned"}
              {" · "}
              {nextAction.dueAt ? `Due ${formatDueDate(nextAction.dueAt)}` : "No deadline recorded"}
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-semibold text-foreground">
              {nextAction.secondaryHref && (
                <a className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={nextAction.secondaryHref}>
                  {nextAction.secondaryLabel ?? "Open related workspace"} →
                </a>
              )}
              <a className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={nextActionHref}>{nextAction.nextStep} →</a>
            </div>
          </div>
        </article>
      ) : (
        <p id="next-authorized-action" role="status" className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground">
          No next action is listed in the current authorized priority view. Review the staffing and student records below.
        </p>
      )}

      {otherItems.length > 0 && (
        <details className="mt-4 rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {otherItems.length} more priority {otherItems.length === 1 ? "item" : "items"}
          </summary>
          <AttentionQueue items={otherItems} />
        </details>
      )}
    </WorkspacePanel>
  );
}
