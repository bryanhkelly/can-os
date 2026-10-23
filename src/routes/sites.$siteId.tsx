import { createFileRoute, Link } from "@tanstack/react-router";
import { getSiteToday } from "@/modules/operations/site-today.functions";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { OpeningHandoffs } from "@/components/operations/OpeningHandoffs";

export const Route = createFileRoute("/sites/$siteId")({
  loader: ({ params }) =>
    safeLoader(
      () => getSiteToday({ data: { siteId: params.siteId } }),
      { authMessage: "You do not have access to this school site." },
    )(),
  component: SiteTodayPage,
});
function SiteTodayPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Site Operations"
    title="Site Today" outcome={outcome} />;
  const data: Awaited<ReturnType<typeof getSiteToday>> = outcome.data;
  const localTime = (date: string) => new Intl.DateTimeFormat("en-US", {
    timeZone: data.site.timezone, hour: "numeric", minute: "2-digit",
  }).format(new Date(date));
  return <WorkspaceShell eyebrow="CAN OS · Site Operations" title={data.site.name}
    subtitle={data.site.organizationName + " · " + data.localDate + " · " + data.site.timezone}
    actions={<div className="flex flex-wrap gap-2">
      <Link className="rounded-lg border px-3 py-2 text-sm" to="/sites/$siteId/publish"
        params={{siteId:data.site.id}}>Public site setup →</Link>
      <Link className="rounded-lg border px-3 py-2 text-sm" to="/operations"
        search={{siteId:undefined,programId:undefined}}>All operations →</Link>
    </div>}>
    <nav aria-label="School operating areas" className="mt-6 flex flex-wrap gap-2 text-sm">
      {([
        ["Operations", "/operations"], ["Launch", "/operations/launch"],
        ["Readiness", "/readiness"], ["Admissions", "/admissions"],
        ["People", "/profiles"], ["Ask CAN", "/ask"],
      ] as const).map(([name, href]) => <Link key={href} to={href} search={{siteId:["/operations","/operations/launch","/admissions"].includes(href)?data.site.id:undefined,programId:undefined}}
        className="rounded-full border px-3 py-1.5 hover:bg-muted">{name}</Link>)}
    </nav>
    <OpeningHandoffs handoffs={data.openingHandoffs}/>
    <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Active enrollment", String(data.enrollment.count), data.enrollment.note],
        ["Attendance recorded", data.attendance.count ? String(data.attendance.count) : "No records", data.attendance.note],
        ["Present records", data.attendance.count ? String(data.attendance.present) : "—", "Today’s recorded attendance observations"],
        ["Open actions", String(data.actions.length), "Scoped outstanding site actions"],
      ].map(([label, value, note]) => <section key={label} className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 font-serif text-3xl">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
      </section>)}
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section>
        <h2 className="font-serif text-2xl">Needs your attention</h2>
        <p className="mt-1 text-sm text-muted-foreground">Outstanding work assigned to this site. Open Operations to review actions.</p>
        <div className="mt-4 space-y-3">
          {data.actions.map(action => <article key={action.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-medium"><Link to="/operations" search={{siteId:data.site.id,programId:undefined,action:action.id}} className="hover:underline">{action.title}</Link></h3>
              <span className="text-xs uppercase text-muted-foreground">{action.priority} · {action.status.replaceAll("_", " ")}</span>
            </div>
            {action.description && <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>}
            <div className="mt-3 flex flex-wrap justify-between gap-3 text-xs">
              <span>{action.dueAt ? "Due " + new Date(action.dueAt).toLocaleDateString() : "No due date"}</span>
              <Link className="underline" to="/operations" search={{siteId:data.site.id,programId:undefined,action:action.id}}>Review action →</Link>
            </div>
          </article>)}
          {!data.actions.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No outstanding actions are recorded for your site.</p>}
        </div>
        <h2 className="mt-8 font-serif text-2xl">Today's schedule</h2>
        <div className="mt-4 space-y-3">
          {data.events.map(event => <article key={event.id} className="flex items-start gap-4 rounded-xl border bg-card p-4">
            <p className="w-20 shrink-0 text-sm font-semibold">{localTime(event.startsAt)}</p>
            <div><h3 className="font-medium"><Link to="/calendar" search={{date:dateKeyInTimezone(event.startsAt,data.site.timezone),event:event.id}} className="hover:underline">{event.title}</Link></h3>
              <p className="text-xs capitalize text-muted-foreground">{event.type.replaceAll("_", " ")}</p></div>
          </article>)}
          {!data.events.length && <p className="rounded-xl border p-5 text-sm text-muted-foreground">No scheduled site events recorded for today.</p>}
        </div>
      </section>
      <aside>
        <h2 className="font-serif text-2xl">Programs</h2>
        <div className="mt-4 space-y-3">
          {data.programs.map(program => <article key={program.id} className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold"><Link to="/operations/launch/$programId" params={{programId:program.id}} search={{siteId:data.site.id,programId:undefined}} className="hover:underline">{program.name}</Link></h3>
            <p className="mt-2 text-xs text-muted-foreground">Grades {program.gradeRange.min}–{program.gradeRange.max} · {program.status.replaceAll("_", " ")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{program.type.replaceAll("_", " ")}</p>
          </article>)}
          {!data.programs.length && <p className="rounded-xl border p-4 text-sm text-muted-foreground">No programs visible in your scope.</p>}
        </div>
        <div className="mt-6 rounded-xl border bg-card p-4">
          <h3 className="font-medium">Attendance overview</h3>
          <p className="mt-2 text-sm">Present: {data.attendance.present} · Absent: {data.attendance.absent} · Tardy: {data.attendance.tardy}</p>
          <p className="mt-2 text-xs text-muted-foreground">{data.attendance.note}. This is not a verified school-wide attendance rate.</p>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Refreshed at {localTime(data.asOf)}. Metrics are derived from canonical records; no fixture totals are substituted.</p>
      </aside>
    </div>
  </WorkspaceShell>;
}
