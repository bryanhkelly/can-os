import { createFileRoute, Link } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { PageFrame, RecordHeader, WorkspaceNotice, WorkspacePanel, StatusBadge } from "@/components/workspace";
import { getDemoCenter } from "@/modules/activities/demo-center.functions";

export const Route = createFileRoute("/centers/demo")({
  loader: safeLoader(() => getDemoCenter()),
  component: DemoCenterPage,
});

function DemoCenterPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="Community learning" title="Center" outcome={result} />;
  if (!result.data) return <PageFrame width="wide"><p>Center not found.</p></PageFrame>;
  const { site, plans } = result.data;
  return <PageFrame width="wide">
    <RecordHeader eyebrow="Community Learning Center · Synthetic demonstration" title={site.name}
      subtitle="After-school enrichment and summer programs. Classes are stored in the CAN OS database." />
    <div className="mt-6 space-y-5">\n      <div className="border border-border bg-card p-5">\n        <h2 className="font-semibold">Teacher-led class rehearsal</h2>\n        <p className="mt-2 text-sm text-muted-foreground">Practice the AI and Digital Skills lesson with an original video and five saved teaching segments. This is not an enrollment or a live class.</p>\n        <Link to="/centers/demo/classroom" className="mt-3 inline-block min-h-11 border border-border px-4 py-3 text-sm font-semibold">Open teacher rehearsal</Link>\n      </div>
      <WorkspaceNotice tone="info">These are planning records, not operating approval.
        Registration opens only after independently verified safety, staffing, session,
        publication, and guardian-consent requirements are met.</WorkspaceNotice>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map(plan => <WorkspacePanel key={plan.seasonId}
          title={plan.activityName}
          description={plan.programName}>
          <div className="space-y-3 text-sm">
            <p>{plan.startsOn} to {plan.endsOn}</p>
            <p>Planned capacity: {plan.capacity ?? "Not set"}</p>
            <StatusBadge tone={plan.published?.registrationOpen ? "success" : "neutral"}>
              {plan.published?.registrationOpen ? "Registration open" : "Planning / approval pending"}
            </StatusBadge>
            <div>
              {plan.published?.registrationOpen ?
                <Link className="font-semibold underline" to="/enrichment/$seasonId"
                  params={{seasonId:plan.seasonId}}>View class and enroll</Link> :
                <p className="text-muted-foreground">
                  Enrollment is not available until this class is approved and published.
                </p>}
            </div>
          </div>
        </WorkspacePanel>)}
      </div>
      <p className="text-sm"><Link to="/enrichment" className="font-semibold underline">
        Browse all published after-school and summer classes</Link></p>
    </div>
  </PageFrame>;
}
