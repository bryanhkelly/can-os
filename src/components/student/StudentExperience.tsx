import { Link } from "@tanstack/react-router";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { EmptyState, StatusBadge, WorkspacePanel, WorkspaceShell } from "@/components/workspace";

/** Read-only, canonical Student Today projection. All mutations live in the owning workflow. */
export function StudentExperience({ liveData }: { liveData: Awaited<ReturnType<typeof getMyStudentToday>> }) {
  const displayName = liveData.student.preferredName ?? liveData.student.firstName;
  const missing = liveData.coursework.filter(item => item.timeliness === "missing");
  const upcoming = liveData.coursework.filter(item => item.status === "assigned" && item.timeliness !== "missing");
  const sectionTimezones = new Map(liveData.sections.map(section => [
    section.sectionId,
    section.siteTimezone ?? section.schoolYearTimezone ?? "UTC",
  ]));
  const firstMissing = missing[0];
  const firstAction = liveData.openActions[0];
  const moreActions = liveData.openActions.filter(action => firstMissing
    ? action.subjectType !== "assessment" || action.subjectId !== firstMissing.assessmentId
    : action.id !== firstAction?.id);
  const format = (date: Date | string, timeZone?: string) => new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(date));

  return (
    <WorkspaceShell
      width="wide"
      eyebrow="CAN OS · Student"
      title={`Today, ${displayName}`}
      subtitle="Your schedule, coursework and next steps, all from your school records."
      actions={
        <Link
          to="/student/courses"
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Open my classes
        </Link>
      }
    >
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Link
          to="/student/courses"
          className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <p className="text-sm text-muted-foreground">Classes</p>
          <p className="mt-2 text-3xl font-semibold">{liveData.sections.length}</p>
        </Link>
        <Link
          to="/student/assignments"
          className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <p className="text-sm text-muted-foreground">Upcoming assignments</p>
          <p className="mt-2 text-3xl font-semibold">{upcoming.length}</p>
        </Link>
        <Link
          to="/student/assignments"
          search={{ filter: "missing" }}
          className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <p className="text-sm text-muted-foreground">Missing work</p>
          <p className="mt-2 text-3xl font-semibold">{missing.length}</p>
        </Link>
      </div>

      <nav aria-label="Student workspace" className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link to="/student/assignments" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">Assignments</Link>
        <Link to="/student/courses" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">Courses</Link>
        <Link to="/student/support" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">Support</Link>
        <Link to="/student/study-groups" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">Study groups</Link>
        <Link to="/student/experiences" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">School & community</Link>
        <Link to="/student/report-card" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">Report card</Link>
        <Link to="/calendar" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2">Calendar</Link>
      </nav>

      {(firstMissing || firstAction) ? (
        <WorkspacePanel
          title={firstMissing ? "Start here" : "Your next step"}
          description={firstMissing ? "This assignment is marked missing in your school records." : "A saved action is ready for your attention."}
          className="mt-7 border-amber-500/40"
        >
          {firstMissing ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <StatusBadge tone="attention">Missing work</StatusBadge>
                <h3 className="mt-3 text-lg font-semibold">
                  <Link to="/student/assignments" search={{ assessment: firstMissing.assessmentId }} className="hover:underline">
                    {firstMissing.assessmentTitle}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{firstMissing.instructions ?? "Review the assignment details."}</p>
              </div>
              <Link
                to="/student/assignments"
                search={{ assessment: firstMissing.assessmentId }}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Review assignment
              </Link>
            </div>
          ) : firstAction ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <StatusBadge>Next step</StatusBadge>
                <h3 className="mt-3 text-lg font-semibold">
                  {firstAction.subjectType === "assessment" ? (
                    <Link to="/student/assignments" search={{ assessment: firstAction.subjectId }} className="hover:underline">
                      {firstAction.title}
                    </Link>
                  ) : (
                    <Link to="/student/experiences" search={{ action: firstAction.id }} className="hover:underline">
                      {firstAction.title}
                    </Link>
                  )}
                </h3>
                {firstAction.description && <p className="mt-1 text-sm text-muted-foreground">{firstAction.description}</p>}
              </div>
              {firstAction.subjectType === "assessment" ? (
                <Link
                  to="/student/assignments"
                  search={{ assessment: firstAction.subjectId }}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Review assignment
                </Link>
              ) : (
                <Link
                  to="/student/experiences"
                  search={{ action: firstAction.id }}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  Review action
                </Link>
              )}
            </div>
          ) : null}
        </WorkspacePanel>
      ) : (
        <EmptyState
          className="mt-7 bg-card"
          title="No urgent items right now."
          description="Check your classes and schedule for what is coming up."
        />
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <WorkspacePanel
          title="Coursework"
          description="Assignments and feedback from your classes."
          className="min-w-0"
        >
          <div className="space-y-3">
            {liveData.coursework.map(item => {
              const status = item.status?.replaceAll("_", " ") ?? "assigned";
              const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
              const tone = item.timeliness === "missing"
                ? "attention"
                : item.status === "returned"
                  ? "attention"
                  : item.status === "graded" || item.status === "submitted"
                  ? "success"
                  : "neutral";
              return (
                <article key={item.assessmentId} className="rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        <Link to="/student/assignments" search={{ assessment: item.assessmentId }} className="hover:underline">
                          {item.assessmentTitle}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{item.instructions ?? "Review course instructions."}</p>
                    </div>
                    <StatusBadge tone={tone}>{item.timeliness === "missing" ? "Missing" : statusLabel}</StatusBadge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{item.dueAt
                    ? `Due ${format(item.dueAt, sectionTimezones.get(item.sectionId) ?? "UTC")} · ${sectionTimezones.get(item.sectionId) ?? "UTC"}`
                    : "No due date"}</p>
                  <Link
                    to="/student/assignments"
                    search={{ assessment: item.assessmentId }}
                    className="mt-3 inline-block text-sm font-semibold underline focus-visible:outline-2"
                  >
                    Open assignment
                  </Link>
                </article>
              );
            })}
            {!liveData.coursework.length && (
              <EmptyState title="No assignments require attention today." />
            )}
          </div>
        </WorkspacePanel>

        <div className="space-y-6">
          <WorkspacePanel title="Schedule" description="Events from your school calendar.">
            <div className="space-y-3">
              {liveData.events.map(event => (
                <article key={event.id} className="rounded-lg border bg-background p-4">
                  <h3 className="font-semibold">
                    <Link
                      to="/calendar"
                      search={{
                        date: dateKeyInTimezone(new Date(event.startsAt).toISOString(), event.timezone),
                        event: event.id,
                      }}
                      className="hover:underline"
                    >
                      {event.title}
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{format(event.startsAt, event.timezone)} · {event.timezone}</p>
                  <p className={`mt-1 text-xs font-semibold ${event.cancelled ? "text-amber-700" : "text-muted-foreground"}`}>
                    {event.cancelled ? "Cancelled" : "Scheduled"}
                  </p>
                  {event.description && <p className="mt-2 text-sm">{event.description}</p>}
                </article>
              ))}
              {!liveData.events.length && <EmptyState title="No scheduled events today." />}
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="My classes" description="Open a class workspace or browse all your classes.">
            {liveData.sections.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {liveData.sections.map(section => (
                  <Link
                    key={section.sectionId}
                    to="/student/courses"
                    search={{ section: section.sectionId }}
                    className="rounded-lg border bg-background p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <h3 className="font-semibold">{section.sectionTitle}</h3>
                    <span className="mt-3 inline-block text-sm underline">Open class</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="Your classes will appear here once they are assigned." />
            )}
          </WorkspacePanel>

          {moreActions.length > 0 && (
            <WorkspacePanel title="More next steps" description="Other open actions in your student workspace.">
              <div className="space-y-3">
                {moreActions.map(action => (
                  <article key={action.id} className="rounded-lg border bg-background p-4">
                    <h3 className="font-semibold">
                      {action.subjectType === "assessment" ? (
                        <Link to="/student/assignments" search={{ assessment: action.subjectId }} className="hover:underline">
                          {action.title}
                        </Link>
                      ) : (
                        <Link to="/student/experiences" search={{ action: action.id }} className="hover:underline">
                          {action.title}
                        </Link>
                      )}
                    </h3>
                    {action.description && <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>}
                    {action.subjectType === "assessment" ? (
                      <Link to="/student/assignments" search={{ assessment: action.subjectId }} className="mt-3 inline-block text-sm underline">
                        Review assignment
                      </Link>
                    ) : (
                      <Link to="/student/experiences" search={{ action: action.id }} className="mt-3 inline-block text-sm underline">
                        Review action
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </WorkspacePanel>
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}
