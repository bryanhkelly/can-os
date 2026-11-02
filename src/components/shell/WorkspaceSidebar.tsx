import { Link } from "@tanstack/react-router";
import { Settings, Users } from "lucide-react";
import { getWorkspaceHome, type WorkspaceNavigationItem } from "./workspace-navigation.registry";
import { SidebarLinks } from "./WorkspaceSidebarLinks";
import { getWorkspaceScopeLabel } from "./workspace-scope";

export function WorkspaceSidebar({ member, sites, links, activePath }: {
  member: { role: string; firstName: string; lastName: string; siteId: string | null };
  sites: readonly { id: string; name: string }[];
  links: readonly WorkspaceNavigationItem[];
  activePath?: string;
}) {
  return <aside aria-label="Workspace sidebar" className="hidden border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
    <div className="border-b p-5">
      <Link to={getWorkspaceHome(member.role) ?? "/"} className="rounded-sm font-serif text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">CAN OS</Link>
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
