import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { type WorkspaceInstitutionSelection, type WorkspaceNavigationItem } from "./workspace-navigation.registry";
import { SidebarLinks } from "./WorkspaceSidebarLinks";

const mobileQuery = "(max-width: 1023px)";
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isMobile = () => window.matchMedia(mobileQuery).matches;

type WorkspaceSidebarProps = {
  member: { role: string };
  links: readonly WorkspaceNavigationItem[];
  institutionSelection?: WorkspaceInstitutionSelection;
  activePath?: string;
  focused?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
};

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  return props.focused
    ? <FocusedWorkspaceSidebar {...props}/>
    : <ExpandedWorkspaceSidebar {...props}/>;
}

function FocusedWorkspaceSidebar({ links, activePath, institutionSelection, expanded = false, onToggle }: WorkspaceSidebarProps) {
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => false);
  return <>
    <aside aria-label="Workspace sidebar" className={`classroom-sidebar ${expanded ? "classroom-sidebar-expanded" : ""} border-r bg-card`}>
      <div className="can-shell-bar flex h-[var(--topbar-height)] flex-col items-center justify-center gap-1 border-b px-2">
        <Link to="/home" activeOptions={{ exact: true }} aria-label="CAN OS home" className="font-serif text-xl font-semibold">
          {expanded && !mobile ? "CAN OS" : "C"}
        </Link>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label={expanded ? "Collapse workspace sidebar" : "Expand workspace sidebar"}
          aria-expanded={expanded} aria-controls={mobile ? "classroom-mobile-links" : "classroom-primary-links"}>
          {expanded ? <PanelLeftClose aria-hidden="true"/> : <PanelLeftOpen aria-hidden="true"/>}
        </Button>
      </div>
      <div id="classroom-primary-links" className="flex min-h-0 flex-1 flex-col">
        <SidebarLinks links={links} activePath={activePath} collapsed={!expanded} institutionSelection={institutionSelection}/>
      </div>
      <Link to="/account/" aria-label="My CAN account" title="My CAN account" className="flex justify-center border-t p-4 text-muted-foreground">
        <Settings className="size-4" aria-hidden="true"/><span className="sr-only">My CAN account</span>
      </Link>
    </aside>
    <Modal open={expanded && mobile} onClose={() => onToggle?.()} label="Workspace navigation"
      className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(18rem,85vw)] rounded-none">
      <div className="flex items-center justify-between border-b p-4"><span className="font-serif text-xl">CAN OS</span>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse workspace sidebar"><PanelLeftClose aria-hidden="true"/></Button></div>
      <div id="classroom-mobile-links"><SidebarLinks links={links} activePath={activePath} onNavigate={onToggle} institutionSelection={institutionSelection}/></div>
    </Modal>
  </>;
}

const footerLinkClass = "flex items-center gap-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function ExpandedWorkspaceSidebar({ member, links, activePath, institutionSelection, expanded = true, onToggle }: WorkspaceSidebarProps) {
  const collapsed = !expanded;
  const footer = (label: string) => ({
    className: `${footerLinkClass} ${collapsed ? "justify-center px-1" : "px-3"}`,
    title: collapsed ? label : undefined,
  });
  return <aside aria-label="Workspace sidebar" className="hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
    <div className={`can-shell-bar flex h-[var(--topbar-height)] items-center gap-2 border-b ${collapsed ? "justify-center px-2" : "pl-2 pr-3"}`}>
      {onToggle && <Button variant="ghost" size="icon" onClick={onToggle} aria-expanded={expanded} aria-controls="workspace-primary-links"
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
        {collapsed ? <PanelLeftOpen aria-hidden="true"/> : <PanelLeftClose aria-hidden="true"/>}
      </Button>}
      {!collapsed && <div className="flex min-w-0 flex-col justify-center">
        <Link to="/" activeOptions={{ exact: true }} className="self-start font-serif text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">CAN OS</Link>
        <p className="mt-0.5 whitespace-nowrap text-3xs font-semibold uppercase tracking-wider text-muted-foreground">Church Academy Network</p>
      </div>}
    </div>
    <div id="workspace-primary-links" className={collapsed ? "pt-4" : undefined}>
      <SidebarLinks links={links} activePath={activePath} collapsed={collapsed} institutionSelection={institutionSelection} />
    </div>
    <div className="mt-auto border-t p-4">
      <Link to="/account/" {...footer("My CAN account")}>
        <Users className="size-4" aria-hidden="true" /><span className={collapsed ? "sr-only" : "font-semibold"}>My CAN</span>
      </Link>
      <Link to="/profiles" {...footer("My profile")}>
        <Users className="size-4" aria-hidden="true" /><span className={collapsed ? "sr-only" : "font-semibold"}>My profile</span>
      </Link>
      <Link to="/account/sessions" {...footer("Account sessions")}>
        <Settings className="size-4" aria-hidden="true" /><span className={collapsed ? "sr-only" : undefined}>Account sessions</span>
      </Link>
      {member.role === "student" && <Link to="/student/settings" {...footer("Preferences")}>
        <Settings className="size-4" aria-hidden="true" /><span className={collapsed ? "sr-only" : undefined}>Preferences</span>
      </Link>}
    </div>
  </aside>;
}
