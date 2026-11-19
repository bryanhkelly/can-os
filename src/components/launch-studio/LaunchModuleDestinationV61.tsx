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
  "site-profile" | "site-information" | "programs-audiences" | "website-brand" | "promote" |
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
    subtitle: "Open only the experiences independently approved to welcome learners.",
    intro: "Publishing the Site website makes public marketing possible, not enrollment. Check each Offering's approved operating model, available seats, required safeguards, receiving Program and separately authorized registration before accepting learners.",
    state: "governed",
    note: "Activation happens only in the receiving authorized enrollment service. This page never infers readiness from a published website or a completed setup step.",
    links: [
      { label: "Review readiness and opening authority", path: id => `/settings/school/compliance?siteId=${scope(id)}`, detail: "Independent approval and operational requirements" },
      { label: "Review Site publication", path: id => `/launch/site?siteId=${scope(id)}&module=publish-site`, detail: "Official website publication and independent HTTPS reachability" },
      { label: "Review admissions and seats", path: id => `/admissions/capacity?siteId=${scope(id)}`, detail: "Approved receiving Programs and capacity, not automatic enrollment" },
      { label: "Configure eligible noncredit registration", path: id => `/programs/noncredit/enrollment?publicSiteId=${scope(id)}`, detail: "Only separately authorized noncredit releases may be open for enrollment" },
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
