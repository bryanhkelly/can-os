import { WorkspacePanel, QueryState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { ReadinessRecord, LaunchReadinessPublication } from "./launch-readiness-types-v61";

/** Presentation only: no independent readiness authorization, storage or commands. */
export function SitePublicationReadinessV61({ publication }: {
  publication: ReadinessRecord<LaunchReadinessPublication>;
}) {
  return <WorkspacePanel headingLevel="h3" title="Your website">
        {publication.state==="loading" && <QueryState loading="Checking website status…"/>}
        {publication.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          We couldn't check your website's publication status. Try again later.
        </WorkspaceNotice>}
        {publication.state==="ready" && <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 [overflow-wrap:anywhere] text-sm">{publication.value.address?.host ?? "Website address not chosen"}</p>
          <StatusBadge tone="neutral">{publication.value.address?.status==="published"
            ? "Published · check that your website is live" : "Not published"}</StatusBadge>
        </div>}
      </WorkspacePanel>;
}
