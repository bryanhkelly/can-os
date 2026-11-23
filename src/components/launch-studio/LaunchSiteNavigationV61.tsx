import { Link } from "@tanstack/react-router";
import { type FriendlySiteIdentity } from "@/domain/friendly-site-urls";
import { Building2, CheckCircle2 } from "lucide-react";
import { completedLaunchStageV61, type LaunchModuleCompletion } from "@/domain/launch-module-completion-v61";
import { Button } from "@/components/ui/button";
import { siteLaunchModules, siteLaunchStagesV61, type SiteLaunchStageV61 } from "@/domain/launch-site-navigation-v61";

export type LaunchSiteNavigationProps = {
  site: { id: string; name: string };
  identity?: FriendlySiteIdentity;
  active?: string;
  statusLabel?: string;
  completion?: LaunchModuleCompletion;
  expanded: string;
  instance: "desktop" | "drawer";
  stagePanelBaseId: string;
  onToggleStage: (stage: SiteLaunchStageV61) => void;
  onNavigate: () => void;
};

/**
 * One Launch navigation component for desktop and mobile. This is presentation
 * only: caller owns navigation state and the route owns Site authorization.
 */
export function LaunchSiteNavigation({
  site, identity, active, statusLabel, completion = {}, expanded, instance, stagePanelBaseId,
  onToggleStage, onNavigate,
}: LaunchSiteNavigationProps) {
  return <div className="flex h-full flex-col bg-card">
    <div className="can-shell-bar flex h-[var(--topbar-height)] flex-col justify-center border-b px-4">
      <p className="text-base font-bold">CAN OS</p>
      <p className="text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">
        Christian Academic Network
      </p>
    </div>
    <div className="m-3 border p-3">
      <p className="text-sm font-semibold">{site.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{statusLabel ?? "Site setup"}</p>
    </div>
    <nav aria-label="Launch Studio navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-3">
      {identity ? <Link to="/o/$organizationSlug/$siteSlug/launch" params={identity}
        onClick={onNavigate}
        className={"block border-b px-3 py-3 text-sm font-semibold " + (!active ? "text-primary" : "")}
        aria-current={!active ? "page" : undefined}>Overview</Link>
      : <Link to="/launch/site" search={{ siteId: site.id }} onClick={onNavigate}
        className={"block border-b px-3 py-3 text-sm font-semibold " + (!active ? "text-primary" : "")}
        aria-current={!active ? "page" : undefined}>Overview</Link>}
      {siteLaunchStagesV61.map((stage, index) => (
        <div key={stage} className="border-b py-1">
          <Button type="button" variant="ghost" aria-expanded={expanded === stage}
            aria-controls={`${stagePanelBaseId}-${instance}-${stage}`}
            onClick={() => onToggleStage(stage)}
            className="flex min-h-11 w-full justify-between px-3 py-3 text-left text-sm font-semibold">
            <span className="flex items-center gap-2">{index + 1}. {stage}
              {completedLaunchStageV61(stage,completion)&&<CheckCircle2 className="size-4 shrink-0 text-success"
                aria-label={stage+" saved setup complete"}/>}
            </span>
            <span aria-hidden="true">{expanded === stage ? "−" : "+"}</span>
          </Button>
          <div id={`${stagePanelBaseId}-${instance}-${stage}`} hidden={expanded !== stage}
            className="space-y-1 pb-2 pl-4">
            {siteLaunchModules.filter(item => item.stage === stage).map(item => (
              <Link key={item.id} to={identity ? "/o/$organizationSlug/$siteSlug/launch" : "/launch/site"}
                params={identity ?? { organizationSlug: "", siteSlug: "" }}
                search={identity ? { module: item.id } : { siteId: site.id, module: item.id }}
                onClick={onNavigate} aria-current={active === item.id ? "page" : undefined}
                className={"flex min-h-11 items-center justify-between gap-2 border-l-2 px-3 py-2 text-xs " +
                  (active === item.id
                    ? "border-primary bg-accent font-bold text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted")}>
                <span>{item.title}</span>
                {completion[item.id]==="complete"&&<CheckCircle2 aria-label={item.title+" saved setup complete"}
                  className="size-4 shrink-0 text-success" />}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
    <div className="m-3 border p-3">
      <Button asChild variant="ghost" className="w-full justify-start">
        <Link to="/sites/$siteId" params={{ siteId: site.id }} onClick={onNavigate}>
          <Building2 className="size-4"/> Site Workspace
        </Link>
      </Button>
    </div>
  </div>;
}
