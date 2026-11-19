/**
 * V6.1 Launch Studio module destinations. Show real owned capabilities and
 * honest planned states instead of a shared "not connected" placeholder.
 * These links do not grant Site, Program, Blueprint or publication authority.
 */
import { ArrowRight, CircleAlert, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import type { siteLaunchModules } from "./LaunchStudioOverviewV61";
import type { PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";

type ModuleId = typeof siteLaunchModules[number]["id"];
export type DestinationModuleId = Exclude<ModuleId,
  "site-profile" | "site-information" | "programs-audiences" | "website-brand" |
  PrepareStageModuleIdV61>;

type ModuleLink = { label: string; path: (siteId: string) => string; detail: string };
type Destination = {
  subtitle: string;
  intro: string;
  state: "planned" | "operational" | "governed";
  note: string;
  links: readonly ModuleLink[];
};
const scope = (siteId: string) => encodeURIComponent(siteId);
export const launchModuleDestinationsV61: Record<DestinationModuleId, Destination> = {
  promote: {
    subtitle: "Introduce your learning community with approved, reviewable materials.",
    intro: "Promotional asset creation and campaign distribution are not yet enabled here. You can edit your saved Site identity and review your private website preview.",
    state: "planned",
    note: "Previewing does not approve claims or send a campaign.",
    links: [
      { label: "Open Website & Brand", path: id => `/launch/website?siteId=${scope(id)}&returnToHub=true`, detail: "Prepare a draft and review your Site identity" },
      { label: "Preview Site website", path: id => `/launch/site-preview?siteId=${scope(id)}`, detail: "Private, authenticated preview; no publication" },
    ],
  },
  recruit: {
    subtitle: "Connect with interested families and learners without treating interest as enrollment.",
    intro: "A dedicated Site-wide recruitment campaign and prospect CRM are not implemented. The existing admissions service can send verified-email application invitations for an independently authorized receiving-school Program.",
    state: "planned",
    note: "Application invitations require an eligible Program and the receiving registrar's permission. They do not admit or enroll a learner.",
    links: [
      { label: "Manage authorized family invitations", path: () => "/admissions/invite-families", detail: "Program-based invitations subject to separate permissions" },
      { label: "Preview family interest experience", path: id => `/brand-preview?siteId=${scope(id)}&view=landing`, detail: "Private preview only; no leads collected" },
    ],
  },
  "interest-events": {
    subtitle: "Invite your community to information sessions, tours and open houses.",
    intro: "The existing Interest Events workspace can create and manage real, Program-linked events under an authorized school registrar. It is not a generic, pre-Program Site event builder.",
    state: "operational",
    note: "Event creation requires an eligible Program and Site/timezone authority; attendance never becomes enrollment automatically.",
    links: [
      { label: "Manage Interest Events", path: id => `/operations/interest-events?siteId=${scope(id)}`, detail: "Actual events and registrations for the selected Site" },
    ],
  },
  open: {
    subtitle: "Activate only after the appropriate independent approvals.",
    intro: "Opening is an authorized institutional or Program transition, never the final step of a generic setup wizard. Open the existing approval workspace to review remaining blockers and authorized next actions.",
    state: "governed",
    note: "No opening, publishing, enrollment or activation command runs on this page.",
    links: [
      { label: "Review readiness and opening authority", path: id => `/settings/school/compliance?siteId=${scope(id)}`, detail: "Independent approval and operational requirements" },
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
    rail={<div className="space-y-4">
      <WorkspacePanel title="Why this matters">
        <p className="text-sm leading-6 text-muted-foreground">{destination.intro}</p>
      </WorkspacePanel>
      <WorkspacePanel title="What comes next">
        <p className="text-sm leading-6 text-muted-foreground">{destination.note}</p>
      </WorkspacePanel>
    </div>}>
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={destination.state === "planned" ? "neutral" : "info"}>
          {destination.state === "planned" ? "Planned capability" :
            destination.state === "operational" ? "Existing operational workflow" : "Independently governed workflow"}
        </StatusBadge>
        <span className="text-xs text-muted-foreground">Your Site remains the same; no new Site is created.</span>
      </div>
      <WorkspacePanel title="Continue with existing capabilities"
        description="Open the existing authorized workspace, retaining the selected Site where that destination supports it.">
        <div className="grid gap-3">
          {destination.links.map(item => <div key={item.label}
            className="flex flex-wrap items-center justify-between gap-3 border bg-background p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
            <Button asChild variant="outline">
              <a href={item.path(siteId)}>{item.label}<ArrowRight aria-hidden="true" /></a>
            </Button>
          </div>)}
        </div>
      </WorkspacePanel>
      {destination.state === "planned"
        ? <WorkspaceNotice><Info aria-hidden="true" className="mr-2 inline size-4"/>
            These are current handoffs, not a promise that this module can create or distribute campaigns.
          </WorkspaceNotice>
        : <WorkspaceNotice tone="info"><CircleAlert aria-hidden="true" className="mr-2 inline size-4"/>
            Permission checks and real operating requirements are enforced by each destination.
          </WorkspaceNotice>}
    </div>
  </WorkspaceShell>;
}
