import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { getOrganizationProfile } from "@/modules/profiles/institution-profiles.functions";
import { WorkspacePanel, WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/organizations/$organizationId")({
  loader: ({ params }) =>
    safeLoader(
      () => getOrganizationProfile({ data: { id: params.organizationId } }),
      { authMessage: "You do not have access to this Organization profile." },
    )(),
  component: OrganizationProfilePage,
});

function OrganizationProfilePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="CAN OS · Organization" title="Organization profile" outcome={outcome} />;
  }

  const { organization, sites, programs } = outcome.data;
  return (
    <WorkspaceShell
      eyebrow="CAN OS · Organization profile"
      title={organization.name}
      subtitle={`${organization.type.replaceAll("_", " ")} · Organization identity and its authorized sites and programs`}
      width="wide"
      actions={<Link className="rounded-lg border px-3 py-2 text-sm" to="/sites">Your sites →</Link>}
    >
      <WorkspacePanel title="Organization identity" description="This profile is the authorized view of the canonical Organization record.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Organization type</dt><dd className="mt-1 capitalize">{organization.type.replaceAll("_", " ")}</dd></div>
          <div><dt className="text-muted-foreground">Legal name</dt><dd className="mt-1">{organization.legalName || "Not recorded"}</dd></div>
          <div><dt className="text-muted-foreground">Profile slug</dt><dd className="mt-1">{organization.slug}</dd></div>
        </dl>
      </WorkspacePanel>

      <WorkspacePanel title="Sites" description="Sites are physical or operational locations belonging to this Organization." className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {sites.map((site) => (
            <article key={site.id} className="rounded-lg border p-4">
              <h3 className="font-semibold">{site.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{site.timezone}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <Link className="underline" to="/sites/$siteId/profile" params={{ siteId: site.id }}>Site profile</Link>
                <Link className="underline" to="/sites/$siteId" params={{ siteId: site.id }}>Site operations</Link>
              </div>
            </article>
          ))}
        </div>
        {!sites.length && <p className="text-sm text-muted-foreground">No sites are visible in this membership's scope.</p>}
      </WorkspacePanel>

      <WorkspacePanel title="Programs" description="A Program is the educational offering: its grade range, delivery model, jurisdiction, academic calendar, and academic/credit authority. One Site may host multiple Programs." className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {programs.map((program) => (
            <article key={program.id} className="rounded-lg border p-4">
              <h3 className="font-semibold">{program.name}</h3>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{program.type.replaceAll("_", " ")} · {program.status}</p>
              <p className="mt-2 text-sm">Grades {program.gradeRange.min}–{program.gradeRange.max}</p>
              <p className="mt-1 text-sm text-muted-foreground">{program.jurisdictionName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  program.deliveryModel.onsite && "Onsite",
                  program.deliveryModel.liveOnline && "Live online",
                  program.deliveryModel.asynchronous && "Asynchronous",
                ].filter(Boolean).join(" · ") || "Delivery model not recorded"}
              </p>
            </article>
          ))}
        </div>
        {!programs.length && <p className="text-sm text-muted-foreground">No Programs are visible in this membership's scope.</p>}
      </WorkspacePanel>
    </WorkspaceShell>
  );
}
