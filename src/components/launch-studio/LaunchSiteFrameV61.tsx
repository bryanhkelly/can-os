
import { useId, useState, type ReactNode } from "react";
import { Globe2, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { siteLaunchModules } from "@/domain/launch-site-navigation-v61";
import type { LaunchModuleCompletion } from "@/domain/launch-module-completion-v61";
import { LaunchSiteNavigation } from "./LaunchSiteNavigationV61";
import { LaunchPreviewSharing } from "./LaunchPreviewSharing";
import { LaunchNavigationGuardProvider } from "./LaunchNavigationGuardProvider";
import { LaunchAccountControls } from "@/components/shell/LaunchAccountControls";

export function LaunchSiteFrame({ site, active, previewHref, statusLabel, previewAvailable = true, completion = {}, children }: {
  site: { id: string; name: string };
  active?: string;
  previewHref?: string;
  statusLabel?: string;
  previewAvailable?: boolean;
  completion?: LaunchModuleCompletion;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const stagePanelBaseId = useId();
  const navigationDrawerId = useId();
  const activeStage = siteLaunchModules.find(item => item.id === active)?.stage ?? "Shape";
  // Derive active-stage expansion immediately on navigation. A prior manual
  // collapse only applies while its corresponding module remains active.
  const [stageChoice, setStageChoice] = useState<{ active?: string; stage: string }>({
    active, stage: activeStage,
  });
  const expanded = stageChoice.active === active ? stageChoice.stage : activeStage;
  const renderSidebar = (instance: "desktop" | "drawer") => (
    <LaunchSiteNavigation site={site} active={active} statusLabel={statusLabel} completion={completion}
      expanded={expanded} instance={instance} stagePanelBaseId={stagePanelBaseId}
      onToggleStage={stage => setStageChoice({
        active, stage: expanded === stage ? "" : stage,
      })}
      onNavigate={() => setDrawer(false)} />
  );
  return <LaunchNavigationGuardProvider><div className="min-h-screen bg-background text-foreground xl:grid xl:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
    <aside className="hidden min-h-0 border-r bg-card xl:sticky xl:top-0 xl:block xl:h-dvh">{renderSidebar("desktop")}</aside>
    <div className="min-w-0">
      <header aria-label="Launch Studio top bar" className="can-shell-bar sticky top-0 z-30 flex min-h-[var(--topbar-height)] flex-wrap items-center justify-between gap-3 border-b bg-card px-[var(--page-gutter)] py-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="xl:hidden" onClick={()=>setDrawer(true)} aria-label="Open launch menu"
            aria-haspopup="dialog" aria-expanded={drawer} aria-controls={navigationDrawerId}>
            <Menu className="size-4" />
          </Button>
          <strong className="text-sm">Launch Studio</strong>
          <span className="hidden border-l pl-3 text-xs text-muted-foreground sm:inline">Shape · Share · Prepare · Launch</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-4">
          {previewAvailable && active !== "website-brand" && <LaunchPreviewSharing key={site.id} siteId={site.id} />}
          {previewAvailable ? <Button asChild variant="ghost" size="sm" className="min-h-11">
            <a href={previewHref ?? "/launch/site-preview?siteId="+encodeURIComponent(site.id)} target="_blank" rel="noopener noreferrer">
              <Globe2 className="size-4"/> Preview Website
            </a>
          </Button> : <Button type="button" variant="ghost" size="sm" disabled
            title="Save a draft in Shape → Website & Brand to enable a private preview."
            className="min-h-11"><Globe2 className="size-4"/> Preview unavailable</Button>}
          <div className="border-l border-border pl-3"><LaunchAccountControls /></div>
        </div>
      </header>
      <Modal id={navigationDrawerId} open={drawer} onClose={() => setDrawer(false)}
        label="Launch Studio navigation" className="m-0 ml-0 h-dvh w-[min(85vw,20rem)] max-h-dvh max-w-none overflow-hidden">
        <div className="flex h-full min-h-0 flex-col bg-card">
          <div className="flex justify-end border-b p-2">
            <Button size="sm" variant="ghost" onClick={() => setDrawer(false)}
              aria-label="Close launch menu"><X className="size-5"/></Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{renderSidebar("drawer")}</div>
        </div>
      </Modal>
      <div>{children}</div>
    </div>
  </div></LaunchNavigationGuardProvider>;
}
