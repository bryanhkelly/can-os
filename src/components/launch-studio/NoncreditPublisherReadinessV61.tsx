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
        <h3 className="text-sm font-semibold">Registration for noncredit learning</h3>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          See which noncredit learning opportunities may be ready for registration.
          Each offering needs its own final checks before people can sign up.
        </p>
        {noncredit.state==="loading" && <p role="status" className="mt-2 text-sm">
          Checking noncredit registration options…
        </p>}
        {noncredit.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          We couldn't check noncredit registration right now. Try again before making plans.
        </WorkspaceNotice>}
        {noncredit.state==="ready" && (() => {
          const candidates=noncredit.value.candidates.filter(item=>
            [...item.siteOptions,...item.digitalSiteOptions].some(site=>site.id===siteId));
          const releases=noncredit.value.published.filter(item=>item.siteId===siteId);
          return <div className="mt-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              {plural(candidates.length, "possible offering")} · {plural(releases.length, "registration listing")}
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
                  This opportunity may be eligible for registration. Capacity, permissions,
                  and final approval must be confirmed before people can sign up.
                </p>
              </li>)}
            </ul>}
            {!releases.length && !candidates.length && <p className="text-sm text-muted-foreground">
              No noncredit registration options are listed for this site yet. Other types of classes may still be available.
            </p>}
            <Button asChild variant="outline" size="sm">
              <Link to="/programs/noncredit/enrollment" search={{publicSiteId:siteId}}>
                Manage noncredit registration
              </Link>
            </Button>
          </div>;
        })()}
      </section>;
}
