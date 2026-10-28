import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { GuardianApplicationForm } from "@/components/enrollment/GuardianApplicationForm";
import {
  getGuardianFamilyApplicationWorkspace,
  startGuardianFamilyApplication,
} from "@/modules/enrollment/guardian-family-applications.functions";

export const Route = createFileRoute("/guardian/apply")({
  validateSearch: (search: Record<string, unknown>): { programId?: string } => ({
    programId: typeof search.programId === "string" ? search.programId : undefined,
  }),
  loader: safeLoader(getGuardianFamilyApplicationWorkspace, {
    authMessage: "Sign in with your verified family account to apply to a school.",
  }),
  component: GuardianApplyPage,
});

function GuardianApplyPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Family" title="Apply to school" outcome={result} />;
  return <GuardianApplyWorkspace data={result.data} />;
}

function GuardianApplyWorkspace({ data }: {
  data: Awaited<ReturnType<typeof getGuardianFamilyApplicationWorkspace>>;
}) {
  const router = useRouter();
  const requestedProgramId = Route.useSearch().programId;

  return <WorkspaceShell eyebrow="CAN OS · Family" title="Apply to a school"
    subtitle="Start a real academic application for an eligible CAN school. An application does not automatically approve enrollment or grant access to a child's records."
    actions={<Button asChild variant="outline"><Link to="/guardian">Family home →</Link></Button>}>
    <WorkspacePanel title="Your applications"
      description="Return to an existing application instead of creating a duplicate. The school controls identity verification and every later transition.">
      {data.applications.length ? <div className="space-y-3">
        {data.applications.map(app => <article className="rounded-xl border bg-background p-4" key={app.applicationId}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold">{app.studentFirstName} {app.studentLastName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{app.programName} · {app.stage.replaceAll("_", " ")}</p></div>
            <StatusBadge tone={app.guardianVerified ? "success" : "attention"}>
              {app.guardianVerified ? "Guardian verified" : "Verification pending"}
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {app.guardianVerified
              ? "Review your enrollment checklist and any offers. Verification does not itself activate enrollment."
              : "Admissions must independently verify your relationship before forms, offers or child academic records become available."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Last updated {new Date(app.updatedAt).toLocaleDateString()}</p>
          {app.guardianVerified && <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/guardian/admission-offers"
            search={{ application: app.applicationId }}>Resume this student's enrollment checklist →</Link></Button>}
        </article>)}
      </div> : <EmptyState title="No applications submitted from this family account yet."
        description="Your saved applications and their current school-managed stages will appear here." />}
      <Button asChild variant="ghost" className="mt-4 px-0 underline underline-offset-4"><Link to="/guardian/admission-offers">
        Verified enrollment checklists and offers →
      </Link></Button>
    </WorkspacePanel>
    <div className="mt-6">
      <GuardianApplicationForm programs={data.programs} households={data.households} requestedProgramId={requestedProgramId}
        onSubmit={input => startGuardianFamilyApplication({ data: input })}
        onSubmitted={async () => { await router.invalidate(); }} />
    </div>
  </WorkspaceShell>;
}
