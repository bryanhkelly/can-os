
import { useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, Globe2, HelpCircle, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { siteLaunchModules } from "./LaunchStudioOverviewV61";
import { LaunchPreviewSharing } from "./LaunchPreviewSharing";

const stages = ["Establish", "Introduce", "Prepare", "Open"] as const;

export function LaunchSiteFrame({ site, active, previewHref, children }: {
  site: { id: string; name: string };
  active?: string;
  previewHref?: string;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const stagePanelBaseId = useId();
  const activeStage = siteLaunchModules.find(item => item.id === active)?.stage ?? "Establish";
  // Derive active-stage expansion immediately on navigation. A prior manual
  // collapse only applies while its corresponding module remains active.
  const [stageChoice, setStageChoice] = useState<{ active?: string; stage: string }>({
    active, stage: activeStage,
  });
  const expanded = stageChoice.active === active ? stageChoice.stage : activeStage;
  const renderSidebar = (instance: "desktop" | "drawer") => (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b px-4 py-5">
        <p className="text-base font-extrabold">CAN OS</p>
        <p className="text-3xs font-bold uppercase tracking-eyebrow text-muted-foreground">Christian Academic Network</p>
      </div>
      <div className="m-3 border p-3">
        <p className="text-sm font-semibold">{site.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">Preparing · Site setup</p>
      </div>
      <nav aria-label="Launch Studio navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 pb-3">
        <Link to="/launch/site" search={{ siteId: site.id }} onClick={() => setDrawer(false)}
          className={"block border-b px-3 py-3 text-sm font-semibold " + (!active ? "text-primary" : "")}
          aria-current={!active ? "page" : undefined}>Overview</Link>
        {stages.map((stage, index) => (
          <div key={stage} className="border-b py-1">
            <Button type="button" variant="ghost" aria-expanded={expanded===stage}
              aria-controls={`${stagePanelBaseId}-${instance}-${stage}`} onClick={()=>setStageChoice({active, stage: expanded===stage ? "" : stage})}
              className="flex min-h-11 w-full justify-between px-3 py-3 text-left text-sm font-semibold">
              <span>{index+1}. {stage}</span><span aria-hidden="true">{expanded===stage ? "−" : "+"}</span>
            </Button>
            <div id={`${stagePanelBaseId}-${instance}-${stage}`} hidden={expanded !== stage} className="space-y-1 pb-2 pl-4">
              {siteLaunchModules.filter(item=>item.stage===stage).map(item=>(
                <Link key={item.id} to="/launch/site" search={{ siteId: site.id, module: item.id }}
                  onClick={() => setDrawer(false)}
                  aria-current={active===item.id ? "page" : undefined}
                  className={"block border-l-2 px-3 py-2 text-xs " +
                    (active===item.id ? "border-primary bg-accent font-bold text-primary" : "border-transparent text-muted-foreground hover:bg-muted")}>
                  {item.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="m-3 border p-3">
        <a href={"/sites/"+encodeURIComponent(site.id)} className="inline-flex min-h-9 items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4" /> Site Workspace
        </a>
      </div>
    </div>
  );
  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
    <aside className="hidden min-h-0 border-r bg-card lg:sticky lg:top-0 lg:block lg:h-dvh">{renderSidebar("desktop")}</aside>
    <div className="min-w-0">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b bg-card px-4 sm:px-7">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={()=>setDrawer(true)} aria-label="Open launch menu">
            <Menu className="size-4" />
          </Button>
          <strong className="text-sm">Launch Studio</strong>
          <span className="hidden border-l pl-3 text-xs text-muted-foreground sm:inline">Site setup</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <LaunchPreviewSharing key={site.id} siteId={site.id} />
          <a href={previewHref ?? "/launch/site-preview?siteId="+encodeURIComponent(site.id)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
            <Globe2 className="size-4"/> Preview Website
          </a>
          <a href="#launch-help" aria-label="Launch help"><HelpCircle className="size-4" /></a>
        </div>
      </header>
      <Modal open={drawer} onClose={() => setDrawer(false)}
        label="Launch Studio navigation" className="m-0 ml-0 h-dvh w-[min(85vw,20rem)] max-h-dvh max-w-none overflow-hidden">
        <div className="flex h-full min-h-0 flex-col bg-card">
          <div className="flex justify-end border-b p-2">
            <Button size="sm" variant="ghost" onClick={() => setDrawer(false)}
              aria-label="Close launch menu"><X className="size-5"/></Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{renderSidebar("drawer")}</div>
        </div>
      </Modal>
      <div id="launch-help">{children}</div>
    </div>
  </div>;
}
