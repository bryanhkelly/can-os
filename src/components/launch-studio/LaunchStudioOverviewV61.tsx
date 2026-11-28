/**
 * CAN OS 6.1 site-admin Launch Studio Overview: route-level center content.
 * Deliberately does NOT render another WorkspaceTopBar or WorkspaceSidebar.
 * Add Overview and four stages to the EXISTING authorized workspace shell's
 * navigation via the shared module registry. Render this under a Site-scoped
 * route only after the server has verified active Site access.
 */
import { ArrowRight, BookOpen, Globe, Users } from "lucide-react";
import { completedLaunchStageV61, type LaunchModuleCompletion } from "@/domain/launch-module-completion-v61";
import { Button } from "@/components/ui/button";
export { siteLaunchModules } from "@/domain/launch-site-navigation-v61";
import { siteLaunchStagesV61, siteLaunchModules, type SiteLaunchStageV61 } from "@/domain/launch-site-navigation-v61";
import { WorkspaceShell, WorkspacePanel, StatusBadge, OutcomeMilestones, type StatusTone, type MilestoneState } from "@/components/workspace";
import { SiteGuideV61 } from "./SiteGuideV61";
import { ExistingSiteProgramsV61 } from "./ExistingSiteProgramsV61";
import type { ExistingSiteProgramsStateV61 } from "@/domain/site-existing-programs-v61";

export type LaunchOverviewProps = {
  site: { id: string; name: string; statusLabel: string; statusTone: StatusTone };
  mode: "first-visit" | "returning";
  nextAction: { title: string; description: string; href: string };
  /** Server-resolved, capability-checked, private preview URL. Null if unavailable. */
  previewUrl: string | null;
  /** Server-resolved route to permanent Site Workspace. */
  workspaceUrl: string;
  completion?: LaunchModuleCompletion;
  existingPrograms?: ExistingSiteProgramsStateV61;
};

const stagePresentation: Record<SiteLaunchStageV61, string> = {
  Shape: "Define your community, who you hope to serve, and what you want to offer.",
  Share: "Tell your story, invite ideas, and build community interest.",
  Prepare: "Choose how to deliver your programs and get the right people and resources in place.",
  Launch: "Welcome participants when each offering is ready and approved.",
};

/**
 * Preview Website belongs in shared WorkspaceTopBar (not in the left nav).
 * Example action slot for a Launch-scoped topbar integration:
 * <Button asChild variant="ghost" size="sm"><a href={previewUrl} target="_blank" rel="noopener noreferrer">Preview Website</a></Button>
 * If previewUrl is null, show disabled/unavailable status, never invent an ID.
 */
export function LaunchStudioOverview({ site, mode, nextAction, previewUrl, workspaceUrl, completion = {}, existingPrograms }: LaunchOverviewProps) {
  const rail = <div className="space-y-4">
    <SiteGuideV61 guide={{
      summary: mode === "first-visit" ? "Your vision begins with a Site, the people you want to serve and the experiences you hope to offer." : `You're continuing the launch plan for ${site.name}.`,
      highlights: [site.statusLabel],
      insight: "You can share a private vision before your services are ready. Operational requirements and registration decisions come later.",
      connection: "Shape informs your website and outreach. Prepare translates intentions into plans; Launch checks each offering's actual readiness.",
      next: nextAction.description,
    }} />
    <WorkspacePanel title="Your website preview">
      <p className="text-sm leading-6 text-muted-foreground">Preview your saved website before publishing. You can also invite others to review a private preview link.</p>
      <div className="mt-4 text-xs text-muted-foreground">Preview: {previewUrl ? "Available" : "Save a website draft to enable preview"}</div>
      {previewUrl && <Button asChild variant="outline" className="mt-3"><a href={previewUrl} target="_blank" rel="noopener noreferrer">Open website preview</a></Button>}
    </WorkspacePanel>
  </div>;
  return <WorkspaceShell title={mode === "first-visit" ? "Bring your community's vision to life." : `Continue preparing ${site.name}.`}
    eyebrow="Launch Studio / Overview"
    subtitle="Shape your vision. Share your story. Prepare to deliver. Launch when ready."
    width="wide" rail={rail}>
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border bg-card p-5">
        <h2 className="text-lg font-semibold">{site.name}</h2>
        <StatusBadge tone={site.statusTone}>{site.statusLabel}</StatusBadge>
      </div>
      {existingPrograms && <ExistingSiteProgramsV61 siteId={site.id} result={existingPrograms} onOverview />}
      <OutcomeMilestones title="Your path to launch" description="Confirmed saved milestones, not approval to operate."
        items={siteLaunchStagesV61.map(stage => {
          const states = siteLaunchModules.filter(item => item.stage === stage).map(item => completion[item.id]);
          const state: MilestoneState = completedLaunchStageV61(stage, completion) ? "complete"
            : states.includes("unavailable") ? "unavailable" : "pending";
          return { id: stage, title: stage, detail: stagePresentation[stage], state };
        })}/> 
      <WorkspacePanel title="Your work, connected">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><BookOpen className="size-5 text-primary"/><h3 className="mt-2 text-sm font-semibold">Programs &amp; experiences</h3><p className="mt-1 text-xs text-muted-foreground">Plan classes, workshops, activities and gatherings</p></div>
          <div><Users className="size-5 text-primary"/><h3 className="mt-2 text-sm font-semibold">Outreach &amp; relationships</h3><p className="mt-1 text-xs text-muted-foreground">Share your website, tell your story and invite interest</p></div>
          <div><Globe className="size-5 text-primary"/><h3 className="mt-2 text-sm font-semibold">People &amp; operations</h3><p className="mt-1 text-xs text-muted-foreground">Prepare staffing, schedules and readiness</p></div>
        </div>
      </WorkspacePanel>
      <div className="flex flex-wrap items-center justify-between gap-4 bg-accent p-5">
        <div><h2 className="text-sm font-semibold">{mode === "first-visit" ? "Ready to begin?" : "Continue where you left off"}</h2><p className="mt-1 text-xs text-muted-foreground">{nextAction.description}</p></div>
        <Button asChild><a href={nextAction.href}>{nextAction.title} <ArrowRight aria-hidden="true"/></a></Button>
      </div>
      <div className="text-right"><Button asChild variant="outline"><a href={workspaceUrl}>Open Site Workspace</a></Button></div>
    </div>
  </WorkspaceShell>;
}