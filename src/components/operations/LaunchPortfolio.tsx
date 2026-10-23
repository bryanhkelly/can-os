import { Link } from "@tanstack/react-router";
import type { listLaunches, listLaunchOptions } from "@/modules/programs/launch.functions";
import { launchReadiness } from "@/domain/launch-readiness";
import { WorkspacePanel, StatusBadge } from "@/components/workspace";

export function LaunchPortfolio({ launches, sites, siteId, programId }: {
  launches: Awaited<ReturnType<typeof listLaunches>>["launches"];
  sites: Awaited<ReturnType<typeof listLaunchOptions>>["sites"];
  siteId?: string; programId?: string;
}) {
  const visible = launches.filter(launch => (!siteId || launch.siteId === siteId) && (!programId || launch.id === programId));
  return <WorkspacePanel title="Launch portfolio" description="Readiness comes from recorded Journey requirements, not an estimated score." className="mt-7"
    actions={programId ? <Link to="/operations/launch" search={{ siteId }} className="text-sm underline">View all launches</Link> : undefined}>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b"><tr><th scope="col" className="p-3">Program / site</th><th scope="col" className="p-3">State</th><th scope="col" className="p-3">Requirements</th><th scope="col" className="p-3">Blocking next steps</th></tr></thead>
        <tbody className="divide-y">{visible.map(launch => {
          const readiness = launchReadiness(launch.requirements);
          return <tr key={launch.id} className="align-top">
            <th scope="row" className="p-3 font-semibold"><Link to="/operations/launch/$programId" params={{ programId: launch.id }}
              search={{ siteId: launch.siteId ?? undefined }} className="underline">{launch.name}</Link>
              <span className="mt-1 block font-normal text-muted-foreground">{sites.find(site => site.id === launch.siteId)?.name ?? "No site assigned"}</span>
              {launch.siteId && launch.publicSite && <span className="mt-2 block font-normal">
                <span className="block text-xs text-muted-foreground">
                  Website {launch.publicSite.status}: {launch.publicSite.host}
                </span>
                <Link to="/sites/$siteId/publish" params={{siteId:launch.siteId}}
                  className="mt-1 inline-block text-xs underline">
                  Review website (publisher permission required)
                </Link>
              </span>}
            </th>
            <td className="p-3"><StatusBadge tone={readiness.blockers.length ? "attention" : "neutral"}>{launch.status}</StatusBadge></td>
            <td className="p-3">{readiness.percentage === null ? "Not configured" : <>
              <span>{readiness.complete} / {readiness.total} complete ({readiness.percentage}%)</span>
              <progress aria-label={`${launch.name} requirements complete`} value={readiness.complete} max={readiness.total} className="mt-2 block w-32 accent-current"/>
            </>}</td>
            <td className="p-3"><p>{!launch.journey ? "Configure launch Journey" : readiness.blockers.length ? readiness.blockers.map(item => item.title).join("; ") : "Review program activation prerequisites"}</p>
              <Link to="/operations/launch" search={{ siteId: launch.siteId ?? undefined, programId: launch.id }} className="mt-2 inline-block underline">Review checklist</Link>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!visible.length && <p role={programId ? "alert" : "status"} className="mt-4 text-sm text-muted-foreground">{programId ? "This launch is unavailable in the selected scope." : "No launches in progress in this scope."}</p>}
  </WorkspacePanel>;
}
