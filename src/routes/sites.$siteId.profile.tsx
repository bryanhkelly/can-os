import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { getSiteProfile } from "@/modules/profiles/institution-profiles.functions";
import { WorkspacePanel, WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/sites/$siteId/profile")({
  loader: ({ params }) =>
    safeLoader(
      () => getSiteProfile({ data: { id: params.siteId } }),
      { authMessage: "You do not have access to this Site profile." },
    )(),
  component: SiteProfilePage,
});

function SiteProfilePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="CAN OS · Site profile" title="Site profile" outcome={outcome} />;
  }

  const { site, programs } = outcome.data;
  const addressLines = Object.entries(site.address ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && !!entry[1].trim(),
  );
  return (
    <WorkspaceShell
      eyebrow="CAN OS · Site profile"
      title={site.name}
      subtitle={`${site.organizationName} · ${site.organizationType.replaceAll("_", " ")}`}
      width="wide"
      actions={
        <>
          <Link className="rounded-lg border px-3 py-2 text-sm" to="/organizations/$organizationId" params={{ organizationId: site.organizationId }}>Organization profile</Link>
          <Link className="rounded-lg border px-3 py-2 text-sm" to="/sites/$siteId" params={{ siteId: site.id }}>Site operations →</Link>
        </>
      }
    >
      <WorkspacePanel title="Site identity" description="This profile is the authorized view of the canonical Site record.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Organization</dt><dd className="mt-1">{site.organizationName}</dd></div>
          <div><dt className="text-muted-foreground">Timezone</dt><dd className="mt-1">{site.timezone}</dd></div>
          <div><dt className="text-muted-foreground">Profile slug</dt><dd className="mt-1">{site.slug}</dd></div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd className="mt-1">
              {addressLines.length
                ? addressLines.map(([key, value]) => <span key={key} className="block">{value}</span>)
                : "Not recorded"}
            </dd>
          </div>
        </dl>
      </WorkspacePanel>

      <WorkspacePanel title="Programs" description="Programs define the educational offerings delivered at this Site. A Program may also be remote or span more than one location." className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {programs.map((program) => {
            const delivery = [
              program.deliveryModel.onsite && "Onsite",
              program.deliveryModel.liveOnline && "Live online",
              program.deliveryModel.asynchronous && "Asynchronous",
            ].filter(Boolean).join(" · ");
            return (
              <article key={program.id} className="rounded-lg border p-4">
                <h3 className="font-semibold">{program.name}</h3>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{program.type.replaceAll("_", " ")} · {program.status}</p>
                <p className="mt-2 text-sm">Grades {program.gradeRange.min}–{program.gradeRange.max}</p>
                <p className="mt-1 text-sm text-muted-foreground">{delivery || "Delivery model not recorded"}</p>
              </article>
            );
          })}
        </div>
        {!programs.length && <p className="text-sm text-muted-foreground">No Programs are visible in this membership's scope.</p>}
      </WorkspacePanel>
    </WorkspaceShell>
  );
}
