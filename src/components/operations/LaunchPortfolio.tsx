import { Link } from "@tanstack/react-router";
import type { listLaunches, listLaunchOptions } from "@/modules/programs/launch.functions";
import { launchReadiness } from "@/domain/launch-readiness";
import { WorkspacePanel, StatusBadge } from "@/components/workspace";

const requirementStatusLabels: Record<string, string> = {
  needs_you: "School action needed",
  needs_can: "CAN review needed",
  waiting_third_party: "Waiting on an external party",
  blocked: "Blocked",
};

export function LaunchPortfolio({ launches, sites, siteId, programId }: {
  launches: Awaited<ReturnType<typeof listLaunches>>["launches"];
  sites: Awaited<ReturnType<typeof listLaunchOptions>>["sites"];
  siteId?: string; programId?: string;
}) {
  const visible = launches.filter(launch => (!siteId || launch.siteId === siteId) && (!programId || launch.id === programId));
  return <WorkspacePanel title="Saved launch records" description="Journey counts and blockers below come from the selected Program’s recorded requirements. They are a summary, not opening approval." className="mt-5"
    actions={programId ? <Link to="/operations/launch" search={{ siteId }} className="text-sm underline">View all launches</Link> : undefined}>
    <div className="grid gap-3">
      {visible.map(launch => {
          const readiness = launchReadiness(launch.requirements);
          return <article key={launch.id} className="rounded-xl border bg-background p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{launch.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sites.find(site => site.id === launch.siteId)?.name ?? "No site assigned"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Program status</span>
                <StatusBadge tone={readiness.blockers.length ? "attention" : "neutral"}>
                  {launch.status.replaceAll("_", " ")}
                </StatusBadge>
              </div>
            </div>
            {launch.siteId && launch.publicSite && <div className="mt-3 rounded-lg border p-3">
              <p className="text-sm font-medium">School website</p>
              <p className="mt-1 text-xs text-muted-foreground">Website {launch.publicSite.status}: {launch.publicSite.host}</p>
              <Link to="/sites/$siteId/publish" params={{siteId:launch.siteId}}
                className="mt-2 inline-block text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Review website (publisher permission required)
              </Link>
            </div>}
            <div className="mt-4 rounded-lg border p-3">
              <h4 className="text-sm font-semibold">Launch Journey</h4>
              {!launch.journey ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  No Launch Journey is available. Progress cannot be reported from this view.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm">
                    Journey status: <span className="font-medium">{launch.journey.status.replaceAll("_", " ")}</span>
                  </p>
                  <p className="mt-1 text-sm">
                    {readiness.total === 0
                      ? "No requirements are recorded in this Journey."
                      : `${readiness.complete} of ${readiness.total} recorded requirements complete.`}
                  </p>
                  {readiness.blockers.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Blocking requirements to review
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {readiness.blockers.map((item, index) => (
                          <li key={`${item.title}:${item.status}:${index}`}>
                            {item.title}
                            {item.status !== "pending" && ` · ${requirementStatusLabels[item.status] ?? item.status.replaceAll("_", " ")}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No blocking requirements are currently reported by this Journey.
                    </p>
                  )}
                </>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Requirement status does not authorize opening. Activation rechecks current prerequisites on the server.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <Link to="/operations/launch"
                search={{ siteId: launch.siteId ?? siteId, programId: launch.id }}
                className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Continue guided launch
              </Link>
              <Link to="/operations/launch/$programId" params={{ programId: launch.id }}
                search={{ siteId: launch.siteId ?? undefined }}
                className="underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Review academic setup
              </Link>
            </div>
          </article>;
        })}
    </div>
    {!visible.length && <p role={programId ? "alert" : "status"} className="mt-4 text-sm text-muted-foreground">{programId ? "This launch is unavailable in the selected scope." : "No launches in progress in this scope."}</p>}
  </WorkspacePanel>;
}
