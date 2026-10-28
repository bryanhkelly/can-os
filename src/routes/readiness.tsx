import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { ArrowUpRight } from "lucide-react";
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
    <WorkflowIntro eyebrow="Program oversight" title="Know what is recorded. Verify what is ready." description="These counts describe program records, not authorization to open, supervise children or enroll students. Review the actual launch requirements before taking action." actions={<Link to="/operations/launch" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Review launch requirements <ArrowUpRight className="size-4" /></Link>} />
    <div className="mt-6 grid gap-4">{outcome.data.map(program=><WorkspacePanel key={program.id} title={program.name}
      description={`${program.organizationName} · ${program.status}`}>
      <p className="text-sm">{program.counts.sections} sections · {program.counts.teachers} teaching assignments · {program.counts.enrollments} enrollment records</p>
    </WorkspacePanel>)}</div>
    {!outcome.data.length&&<p role="status" className="mt-6 text-sm">No programs are available in this membership.</p>}
    <p className="mt-6 text-sm">Authorized program operators can review blocking requirements in <Link to="/operations/launch" className="underline">Program launches</Link>.</p>
  </WorkspaceShell>;
}
