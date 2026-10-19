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
  return <WorkspaceShell title="Program overview" eyebrow="CAN OS · Programs"
    subtitle="Recorded program status and operational counts. Counts are not readiness or activation approval.">
    <div className="mt-6 grid gap-4">{outcome.data.map(program=><WorkspacePanel key={program.id} title={program.name}
      description={`${program.organizationName} · ${program.status}`}>
      <p className="text-sm">{program.counts.sections} sections · {program.counts.teachers} teaching assignments · {program.counts.enrollments} enrollment records</p>
    </WorkspacePanel>)}</div>
    {!outcome.data.length&&<p role="status" className="mt-6 text-sm">No programs are available in this membership.</p>}
    <p className="mt-6 text-sm">Authorized program operators can review blocking requirements in <Link to="/operations/launch" className="underline">Program launches</Link>.</p>
  </WorkspaceShell>;
}
