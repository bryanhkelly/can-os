import { ArrowUpRight, ClipboardCheck, ShieldCheck } from "lucide-react";
import {createFileRoute,Link} from "@tanstack/react-router";
import {getScopedPrograms} from "@/modules/operations/program-preview.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell,WorkspacePanel} from "@/components/workspace";
export const Route=createFileRoute("/readiness")({
  loader:safeLoader(()=>getScopedPrograms(),{authMessage:"Sign in with authorized program access."}),component:ReadinessPage,
});
function ReadinessPage(){
  const outcome=Route.useLoaderData();
  if(!outcome.ok)return <LoaderFailure title="Program overview" outcome={outcome}/>;
  return <WorkspaceShell title="Program readiness" eyebrow="CAN OS · Programs"
    subtitle="Recorded program status and operational counts. Counts are not readiness or activation approval.">
    <section aria-label="Program readiness guidance" className="relative mt-3 overflow-hidden rounded-3xl border border-border/70 bg-card px-6 py-8 shadow-sm sm:px-9 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-64 rounded-full bg-accent opacity-70 blur-3xl" />
      <div className="relative">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><ShieldCheck className="size-4" /> Program oversight</p>
        <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Know what is recorded. Verify what is ready.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">These counts describe program records, not authorization to open, supervise children or enroll students. Review the actual launch requirements before taking action.</p>
        <Link to="/operations/launch" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><ClipboardCheck className="size-4" /> Review launch requirements <ArrowUpRight className="size-4" /></Link>
      </div>
    </section>
    <div className="mt-6 grid gap-4">{outcome.data.map(program=><WorkspacePanel key={program.id} title={program.name}
      description={`${program.organizationName} · ${program.status}`}>
      <p className="text-sm">{program.counts.sections} sections · {program.counts.teachers} teaching assignments · {program.counts.enrollments} enrollment records</p>
    </WorkspacePanel>)}</div>
    {!outcome.data.length&&<p role="status" className="mt-6 text-sm">No programs are available in this membership.</p>}
    <p className="mt-6 text-sm">Authorized program operators can review blocking requirements in <Link to="/operations/launch" className="underline">Program launches</Link>.</p>
  </WorkspaceShell>;
}
