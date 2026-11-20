/**
 * CAN OS 6.1 site-admin Launch Studio Overview: route-level center content.
 * Deliberately does NOT render another WorkspaceTopBar or WorkspaceSidebar.
 * Add Overview and four stages to the EXISTING authorized workspace shell's
 * navigation via the shared module registry. Render this under a Site-scoped
 * route only after the server has verified active Site access.
 */
import { ArrowRight, BookOpen, Building2, ClipboardCheck, Globe, Info, Megaphone, Rocket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
export { siteLaunchModules } from "@/domain/launch-site-navigation-v61";
import { siteLaunchStagesV61, type SiteLaunchStageV61 } from "@/domain/launch-site-navigation-v61";
import { WorkspaceShell, WorkspacePanel, WorkspaceNotice, StatusBadge, type StatusTone } from "@/components/workspace";

export type LaunchOverviewProps = {
  site: { id: string; name: string; statusLabel: string; statusTone: StatusTone };
  mode: "first-visit" | "returning";
  nextAction: { title: string; description: string; href: string };
  /** Server-resolved, capability-checked, private preview URL. Null if unavailable. */
  previewUrl: string | null;
  /** Server-resolved route to permanent Site Workspace. */
  workspaceUrl: string;
};

const stagePresentation: Record<SiteLaunchStageV61, {
  icon: typeof Building2;
  summary: string;
}> = {
  Establish: { icon: Building2, summary: "Complete your Site, explore programs and audiences, and create your website." },
  Introduce: { icon: Megaphone, summary: "Promote your community, connect with prospective learners and host events." },
  Prepare: { icon: ClipboardCheck, summary: "Select Solutions, verify facilities, people, safeguards and funding, then explicitly publish the public Site website." },
  Open: { icon: Rocket, summary: "Enable Enrollment only for independently approved, enrollable Offerings." },
};
const stages = siteLaunchStagesV61.map(id => ({ id, ...stagePresentation[id] }));

/**
 * Preview Website belongs in shared WorkspaceTopBar (not in the left nav).
 * Example action slot for a Launch-scoped topbar integration:
 * <Button asChild variant="ghost" size="sm"><a href={previewUrl} target="_blank" rel="noopener noreferrer">Preview Website</a></Button>
 * If previewUrl is null, show disabled/unavailable status, never invent an ID.
 */
export function LaunchStudioOverview({ site, mode, nextAction, previewUrl, workspaceUrl }: LaunchOverviewProps) {
  const rail = <div className="space-y-4">
    <WorkspacePanel title="Why this matters">
      <p className="text-sm leading-6 text-muted-foreground">Launch Studio takes your Site from an initial identity to planned programs, community outreach and verified operational readiness.</p>
      <div className="mt-5 border-t pt-4"><h3 className="text-sm font-semibold">Work at your own pace</h3><p className="mt-2 text-sm text-muted-foreground">The same Site capabilities remain in your permanent workspace.</p></div>
    </WorkspacePanel>
    <WorkspacePanel title="Your website, as it grows">
      <p className="text-sm leading-6 text-muted-foreground">Preview the latest saved website from the shared top bar. Create a revocable, unlisted share link to show a proposed Site before approval. Official publication is a separate Prepare step.</p>
      <div className="mt-4 text-xs text-muted-foreground">Preview: {previewUrl ? "Available to your authorized account" : "Not available yet"}</div>
    </WorkspacePanel>
  </div>;
  return <WorkspaceShell title={mode === "first-visit" ? "Bring your learning community to life." : `Continue preparing ${site.name}.`}
    eyebrow="Launch Studio / Overview"
    subtitle="CAN OS brings learning experiences, community outreach and daily Site operations together."
    width="wide" rail={rail}>
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border bg-card p-5">
        <div><h2 className="text-lg font-semibold">{site.name}</h2><p className="mt-1 text-xs text-muted-foreground">Current Site context</p></div>
        <StatusBadge tone={site.statusTone}>{site.statusLabel}</StatusBadge>
      </div>
      <WorkspacePanel title="One Site. Many possibilities." description="You can add programs as your learning community grows.">
        <p className="text-sm leading-6 text-muted-foreground">Start with the Site you established. Explore your programs, build a web presence, and prepare to welcome learners without recreating the Site.</p>
      </WorkspacePanel>
      <section aria-labelledby="launch-stage-heading">
        <h2 id="launch-stage-heading" className="mb-2 text-lg font-semibold">Your path to opening</h2>
        <p className="mb-4 text-sm text-muted-foreground">Four stages, with optional internal steps in longer modules.</p>
        <div className="grid gap-3 sm:grid-cols-2">{stages.map((stage, index) => {
          const Icon = stage.icon;
          return <article key={stage.id} className="border bg-card p-5">
            <div className="flex items-center justify-between"><Icon aria-hidden="true" className="size-5 text-primary"/><span className="text-xs text-muted-foreground">0{index + 1}</span></div>
            <h3 className="mt-3 font-semibold">{stage.id}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.summary}</p>
          </article>;
        })}</div>
      </section>
      <WorkspacePanel title="What CAN OS enables">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><BookOpen className="size-5 text-primary"/><h3 className="mt-2 text-sm font-semibold">Learning experiences</h3><p className="mt-1 text-xs text-muted-foreground">Programs, Courses, Classes and schedules</p></div>
          <div><Users className="size-5 text-primary"/><h3 className="mt-2 text-sm font-semibold">Community connection</h3><p className="mt-1 text-xs text-muted-foreground">Websites, communications and engagement</p></div>
          <div><Globe className="size-5 text-primary"/><h3 className="mt-2 text-sm font-semibold">Daily operations</h3><p className="mt-1 text-xs text-muted-foreground">Teams, attendance and reporting</p></div>
        </div>
      </WorkspacePanel>
      <div className="flex flex-wrap items-center justify-between gap-4 bg-accent p-5">
        <div><h2 className="text-sm font-semibold">{mode === "first-visit" ? "Ready to begin?" : "Continue where you left off"}</h2><p className="mt-1 text-xs text-muted-foreground">{nextAction.description}</p></div>
        <Button asChild><a href={nextAction.href}>{nextAction.title} <ArrowRight aria-hidden="true"/></a></Button>
      </div>
      <WorkspaceNotice tone="info"><Info aria-hidden="true" className="inline size-4"/> Configuration, website publication, Site qualification, and enrollment authorization are separate decisions.</WorkspaceNotice>
      <div className="text-right"><Button asChild variant="outline"><a href={workspaceUrl}>Open Site Workspace</a></Button></div>
    </div>
  </WorkspaceShell>;
}