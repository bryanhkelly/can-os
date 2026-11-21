import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { ReadinessRecord, LaunchReadinessPublication } from "./launch-readiness-types-v61";

/** Presentation only: no independent readiness authorization, storage or commands. */
export function SitePublicationReadinessV61({ publication }: {
  publication: ReadinessRecord<LaunchReadinessPublication>;
}) {
  return <section className="border bg-background p-4" aria-label="Website publication state">
        <h3 className="text-sm font-semibold">Your website</h3>
        {publication.state==="loading" && <p role="status" className="mt-2 text-sm">Checking website status…</p>}
        {publication.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          We couldn't check your website's publication status. Try again later.
        </WorkspaceNotice>}
        {publication.state==="ready" && <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{publication.value.address?.host ?? "Website address not chosen"}</p>
          <StatusBadge tone="neutral">{publication.value.address?.status==="published"
            ? "Published · check that your website is live" : "Not published"}</StatusBadge>
        </div>}
      </section>;
}
