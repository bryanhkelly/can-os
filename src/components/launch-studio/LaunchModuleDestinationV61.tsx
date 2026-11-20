/**
 * V6.1 Launch Studio module destinations. Show real owned capabilities and
 * honest planned states instead of a shared "not connected" placeholder.
 * These links do not grant Site, Program, Blueprint or publication authority.
 */
import { CircleAlert } from "lucide-react";
import { StatusBadge, WorkspaceActionLink, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import type { siteLaunchModules } from "./LaunchStudioOverviewV61";
import { LaunchGuidancePanels } from "./LaunchGuidancePanels";
import { LaunchReadinessPanelV61 } from "./LaunchReadinessPanelV61";
import type { PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";

type ModuleId = typeof siteLaunchModules[number]["id"];
export type DestinationModuleId = Exclude<ModuleId,
  "site-profile" | "site-information" | "programs-audiences" | "website-brand" |
  "promote" | "recruit" | "interest-events" |
  PrepareStageModuleIdV61>;

type ModuleLink = { label: string; path: (siteId: string) => string; detail: string };
type Destination = {
  subtitle: string;
  intro: string;
  state: "governed";
  note: string;
  links: readonly ModuleLink[];
};
const scope = (siteId: string) => encodeURIComponent(siteId);
export const launchModuleDestinationsV61: Record<DestinationModuleId, Destination> = {
  open: {
    subtitle: "Enable Enrollment only for Offerings independently authorized to receive learners.",
    intro: "Funding and admissions are prepared before opening. Publishing the Site website does not enable enrollment. Each Offering must have an approved operating model, required safeguards, capacity and a receiving Program before its registration may be activated.",
    state: "governed",
    note: "Enable Enrollment is an independent action in the authorized receiving service, not a Site-wide toggle. Publishing the website or completing Prepare never activates registration.",
    links: [
      { label: "Review readiness and opening authority", path: id => `/settings/school/compliance?siteId=${scope(id)}`, detail: "Independent approval and operational requirements" },
      { label: "Review Site publication", path: id => `/launch/site?siteId=${scope(id)}&module=publish-site`, detail: "Official website publication and independent HTTPS reachability" },
      { label: "Review admissions and seats", path: id => `/admissions/capacity?siteId=${scope(id)}`, detail: "Approved receiving Programs and capacity, not automatic enrollment" },
      { label: "Manage eligible noncredit registration", path: id => `/programs/noncredit/enrollment?publicSiteId=${scope(id)}`, detail: "Enable enrollment only for independently approved noncredit releases" },
      { label: "Open your Site workspace", path: id => `/sites/${scope(id)}`, detail: "Existing Site operations, subject to active membership" },
    ],
  },
};

export function isDestinationModuleV61(id: ModuleId): id is DestinationModuleId {
  return Object.prototype.hasOwnProperty.call(launchModuleDestinationsV61, id);
}

export function LaunchModuleDestinationV61({ module, title, stage, siteId }: {
  module: DestinationModuleId; title: string; stage: string; siteId: string;
}) {
  const destination = launchModuleDestinationsV61[module];
  return <WorkspaceShell title={title} eyebrow={`${stage} / ${title}`}
    subtitle={destination.subtitle} width="wide"
    rail={<LaunchGuidancePanels guidance={{ why: destination.intro, next: destination.note }} />}>
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone="info">Independently governed workflow</StatusBadge>
        <span className="text-xs text-muted-foreground">Your Site remains the same; no new Site is created.</span>
      </div>
      {module === "open" && <LaunchReadinessPanelV61 siteId={siteId} context="open" />}
      <WorkspacePanel title={module === "open" ? "Enable Enrollment" : "Continue with existing capabilities"}
        description={module === "open"
          ? "Review readiness, then use each Offering’s authorized registration workspace to enable enrollment independently."
          : "Open the existing authorized workspace, retaining the selected Site where that destination supports it."}>
        <div className="grid gap-3">
          {destination.links.map(item => <WorkspaceActionLink key={item.label}
            title={item.label} description={item.detail} href={item.path(siteId)}
            actionLabel={item.label} />)}
        </div>
      </WorkspacePanel>
      <WorkspaceNotice tone="info"><CircleAlert aria-hidden="true" className="mr-2 inline size-4"/>
        Permission checks and real operating requirements are enforced by each destination.
      </WorkspaceNotice>
    </div>
  </WorkspaceShell>;
}
