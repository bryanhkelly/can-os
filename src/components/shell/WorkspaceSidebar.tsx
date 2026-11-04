import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getWorkspaceHome, type WorkspaceNavigationItem } from "./workspace-navigation.registry";
import { SidebarLinks } from "./WorkspaceSidebarLinks";
import { getWorkspaceScopeLabel } from "./workspace-scope";

const mobileQuery = "(max-width: 1023px)";
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isMobile = () => window.matchMedia(mobileQuery).matches;

type WorkspaceSidebarProps = {
  member: { role: string; firstName: string; lastName: string; siteId: string | null };
  sites: readonly { id: string; name: string }[];
  links: readonly WorkspaceNavigationItem[];
  activePath?: string;
  focused?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
};

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  return props.focused ? <FocusedWorkspaceSidebar {...props}/> : <ExpandedWorkspaceSidebar {...props}/>;
}

function FocusedWorkspaceSidebar({ member, sites, links, activePath, expanded = false, onToggle }: WorkspaceSidebarProps) {
  const mobile = useSyncExternalStore(subscribeMobile, isMobile, () => false);
  return <>
    <aside aria-label="Workspace sidebar" className={`classroom-sidebar ${expanded ? "classroom-sidebar-expanded" : ""} border-r bg-card`}>
      <div className="flex flex-col items-center gap-3 border-b px-2 py-4">
        <Link to={member.role === "student" ? "/" : getWorkspaceHome(member.role) ?? "/"} aria-label="CAN OS home" className="font-serif text-xl font-semibold">
          {expanded && !mobile ? "CAN OS" : "C"}
        </Link>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label={expanded ? "Collapse workspace sidebar" : "Expand workspace sidebar"}
          aria-expanded={expanded} aria-controls={mobile ? "classroom-mobile-links" : "classroom-primary-links"}>
          {expanded ? <PanelLeftClose aria-hidden="true"/> : <PanelLeftOpen aria-hidden="true"/>}
        </Button>
      </div>
      <div id="classroom-primary-links" className="flex min-h-0 flex-1 flex-col">
        {expanded && <div className="hidden p-4 lg:block"><p className="text-sm font-semibold">{member.firstName} {member.lastName}</p>
          <p className="mt-1 text-xs text-muted-foreground">{getWorkspaceScopeLabel(member, sites)}</p></div>}
        <SidebarLinks links={links} activePath={activePath} collapsed={!expanded}/>
      </div>
      <Link to="/account/sessions" aria-label="Account sessions" title="Account sessions" className="flex justify-center border-t p-4 text-muted-foreground">
        <Settings className="size-4" aria-hidden="true"/><span className="sr-only">Account sessions</span>
      </Link>
    </aside>
    <Modal open={expanded && mobile} onClose={() => onToggle?.()} label="Workspace navigation"
      className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(18rem,85vw)] rounded-none">
      <div className="flex items-center justify-between border-b p-4"><span className="font-serif text-xl">CAN OS</span>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse workspace sidebar"><PanelLeftClose aria-hidden="true"/></Button></div>
      <div className="p-4"><p className="font-semibold">{member.firstName} {member.lastName}</p>
        <p className="text-xs text-muted-foreground">{getWorkspaceScopeLabel(member, sites)}</p></div>
      <div id="classroom-mobile-links"><SidebarLinks links={links} activePath={activePath} onNavigate={onToggle}/></div>
    </Modal>
  </>;
}

function ExpandedWorkspaceSidebar({ member, sites, links, activePath }: WorkspaceSidebarProps) {
  return <aside aria-label="Workspace sidebar" className="hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
    <div className="border-b p-5">
      <Link to={member.role==="student"?"/":getWorkspaceHome(member.role) ?? "/"} className="rounded-sm font-serif text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">CAN OS</Link>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">Church Academy Network</p>
    </div>
    <div className="p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{member.role} workspace</p>
      <p className="mt-2 text-sm font-semibold">{member.firstName} {member.lastName}</p>
      <p className="mt-1 text-xs text-muted-foreground">{getWorkspaceScopeLabel(member, sites)}</p>
    </div>
    <SidebarLinks links={links} activePath={activePath} />
    <div className="border-t p-4">
      <Link to="/profiles" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Users className="size-4" aria-hidden="true" />My profile
      </Link>
      <Link to="/account/sessions" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Settings className="size-4" aria-hidden="true" />Account sessions
      </Link>
      {member.role === "student" && <Link to="/student/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Settings className="size-4" aria-hidden="true" />Preferences
      </Link>}
    </div>
  </aside>;
}
