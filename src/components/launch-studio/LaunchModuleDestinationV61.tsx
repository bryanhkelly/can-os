/**
 * V6.1 Launch Studio module destinations. Show real owned capabilities and
 * honest planned states instead of a shared "not connected" placeholder.
 * These links do not grant Site, Program, Blueprint or publication authority.
 */
import { WorkspaceActionLink, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import type { siteLaunchModules } from "./LaunchStudioOverviewV61";
import { LaunchGuidancePanels } from "./LaunchGuidancePanels";
import { LaunchReadinessPanelV61 } from "./LaunchReadinessPanelV61";
import type { PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";

type ModuleId = typeof siteLaunchModules[number]["id"];
export type DestinationModuleId = Exclude<ModuleId,
  "site-profile" | "site-information" | "programs-audiences" | "website-brand" |
  "create-outreach" | "my-outreach" |
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
    subtitle: "Ready to welcome participants?",
    intro: "Review what is ready, what still needs attention, and which offerings can accept participants.",
    state: "governed",
    note: "Each approved offering has its own registration settings.",
    links: [
      { label: "Review opening requirements", path: id => `/settings/school/compliance?siteId=${scope(id)}`, detail: "Check opening requirements" },
      { label: "Review website publication", path: id => `/launch/site?siteId=${scope(id)}&module=publish-site`, detail: "Review website publication" },
      { label: "Review admissions and seats", path: id => `/admissions/capacity?siteId=${scope(id)}`, detail: "Review available seats for programs using admissions" },
      { label: "Manage eligible noncredit registration", path: id => `/programs/noncredit/enrollment?publicSiteId=${scope(id)}`, detail: "Manage approved noncredit registration" },
      { label: "Open your Site workspace", path: id => `/sites/${scope(id)}`, detail: "Go to your Site Workspace" },
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
    rail={<LaunchGuidancePanels guidance={{ why: destination.intro,
      tip: "Review the actual readiness results below, including any missing Solution-specific, staffing or safety decisions. A published website is not proof that registration can open.",
      next: destination.note }} />}>
    <div className="mt-5 space-y-5">
      {module === "open" && <LaunchReadinessPanelV61 siteId={siteId} context="open" />}
      <WorkspacePanel title={module === "open" ? "Welcome participants" : "Your next steps"}
        description={module === "open"
          ? "Check readiness, then open registration for each eligible offering."
          : "Open the existing authorized workspace, retaining the selected Site where that destination supports it."}>
        <div className="grid gap-3">
          {destination.links.map(item => <WorkspaceActionLink key={item.label}
            title={item.label} description={item.detail} href={item.path(siteId)}
            actionLabel={item.label} />)}
        </div>
      </WorkspacePanel>
    </div>
  </WorkspaceShell>;
}
