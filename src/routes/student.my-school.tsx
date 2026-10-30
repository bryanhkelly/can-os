import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, BookOpen, Users, ArrowUpRight } from "lucide-react";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { WorkspaceShell, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/student/my-school")({
  loader: safeLoader(() => getSchoolExperiences(), {
    authMessage: "Sign in as an enrolled student to see your school community.",
  }),
  component: MySchoolPage,
});

function MySchoolPage() {
  const outcome = Route.useLoaderData();
  const { session } = useWorkspaceSession();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Student" title="My School" outcome={outcome} />;
  const schoolNames = session?.authenticated ? session.sites.map(site => site.name) : [];
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Student" title="My School"
    subtitle="Your local school community, announcements, events and opportunities to connect.">
    <section className="border-b pb-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Your school community</p>
      <h2 className="mt-2 font-serif text-3xl">{schoolNames.length === 1 ? schoolNames[0] : "Your authorized schools"}</h2>
      {schoolNames.length > 1 && <p className="mt-2 text-sm text-muted-foreground">{schoolNames.join(" · ")}</p>}
      {!schoolNames.length && <p className="mt-2 text-sm text-muted-foreground">Your local school will appear here when it is connected to your student account.</p>}
    </section>
    <nav aria-label="My School destinations" className="mt-6 grid gap-3 sm:grid-cols-3">
      <Link to="/calendar" className="flex min-h-20 items-center justify-between rounded-xl border p-4 text-sm font-semibold hover:bg-muted"><span className="flex items-center gap-2"><CalendarDays className="size-5"/>School calendar</span><ArrowUpRight className="size-4"/></Link>
      <Link to="/student/study-groups" className="flex min-h-20 items-center justify-between rounded-xl border p-4 text-sm font-semibold hover:bg-muted"><span className="flex items-center gap-2"><Users className="size-5"/>Study Groups</span><ArrowUpRight className="size-4"/></Link>
      <Link to="/student/courses" className="flex min-h-20 items-center justify-between rounded-xl border p-4 text-sm font-semibold hover:bg-muted"><span className="flex items-center gap-2"><BookOpen className="size-5"/>My classes</span><ArrowUpRight className="size-4"/></Link>
    </nav>
    {outcome.data.connected
      ? <LiveSchoolExperiences data={outcome.data}/>
      : <EmptyState title="School experiences are temporarily unavailable" description="Your school calendar and announcements could not be loaded. Try again later." />}
  </WorkspaceShell>;
}
