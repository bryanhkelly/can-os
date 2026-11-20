import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import { plural } from "@/lib/format";
import type { ReadinessRecord, LaunchReadinessNoncredit } from "./launch-readiness-types-v61";

/** Presentation only: no independent readiness authorization, storage or commands. */
export function NoncreditPublisherReadinessV61({ siteId,noncredit }: {
  siteId: string; noncredit: ReadinessRecord<LaunchReadinessNoncredit>;
}) {
  return <section className="border bg-background p-4"
        aria-label="Independently authorized noncredit enrollment releases">
        <h3 className="text-sm font-semibold">Noncredit Offering enrollment</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          The existing publisher service alone determines candidate availability and issued
          enrollment releases. A candidate is not an active registration.
        </p>
        {noncredit.state==="loading" && <p role="status" className="mt-2 text-sm">
          Checking authorized noncredit Offering records…
        </p>}
        {noncredit.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          Current noncredit enrollment authority could not be verified for this account.
          This does not mean an Offering is approved or unavailable.
        </WorkspaceNotice>}
        {noncredit.state==="ready" && (() => {
          const candidates=noncredit.value.candidates.filter(item=>
            [...item.siteOptions,...item.digitalSiteOptions].some(site=>site.id===siteId));
          const releases=noncredit.value.published.filter(item=>item.siteId===siteId);
          return <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              {plural(candidates.length, "publisher candidate")} · {plural(releases.length, "recorded enrollment release")}
            </p>
            {releases.length>0 && <ul className="space-y-2">
              {releases.map(item=><li key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <p className="min-w-0 text-sm font-medium">{item.title}</p>
                <StatusBadge tone="neutral">Recorded status: {item.status}</StatusBadge>
              </li>)}
            </ul>}
            {candidates.length>0 && <ul className="space-y-2">
              {candidates.map(item=><li key={[item.deploymentId,item.adoptionId,
                item.trainingVersionId,item.courseVersionId].join(":")} className="border p-3">
                <p className="text-sm font-medium">{item.trainingTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Authorized provider candidate. Final enrollment publication still requires
                  the receiving service to validate current release, capacity and consent.
                </p>
              </li>)}
            </ul>}
            {!releases.length && !candidates.length && <p className="text-sm text-muted-foreground">
              No noncredit publisher candidates or issued enrollment releases for this Site.
              Other academic and Class enrollment systems are independent.
            </p>}
            <Button asChild variant="outline" size="sm">
              <Link to="/programs/noncredit/enrollment" search={{publicSiteId:siteId}}>
                Manage independently authorized noncredit enrollment
              </Link>
            </Button>
          </div>;
        })()}
      </section>;
}
