import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Globe,
  Home,
  LifeBuoy,
  MessagesSquare,
  ShieldAlert,
  Settings2,
  Users,
} from "lucide-react";
import type { WorkspaceNavigationItem } from "./workspace-navigation.registry";

const focusRingClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const navigationIcons = {
  home: Home, building: Building2, globe: Globe, book: BookOpen, calendar: CalendarDays, clipboard: ClipboardList,
  support: LifeBuoy, messages: MessagesSquare, safety: ShieldAlert, users: Users, settings: Settings2,
} satisfies Record<WorkspaceNavigationItem["icon"], typeof Home>;

export function SidebarLinks({ links, activePath, collapsed = false, onNavigate }: {
  links: readonly WorkspaceNavigationItem[];
  activePath?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const search = useLocation({ select: location => location.searchStr });
  const searchParams = new URLSearchParams(search);
  return <nav aria-label="CAN OS primary navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
    {links.map(item => {
      const Icon = navigationIcons[item.icon];
      const active = activePath === item.path;
      const launchSearch = new URLSearchParams();
      if (item.path === "/launch/school") {
        for (const key of ["siteId", "programId"] as const) {
          const value = searchParams.get(key);
          if (value) launchSearch.set(key, value);
        }
      }
      const destination = launchSearch.size ? `${item.path}?${launchSearch.toString()}` : item.path;

      return <Link key={item.path} to={destination} activeOptions={{ exact: true, includeSearch: false }}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.title : undefined} onClick={onNavigate}
        className={`flex items-center gap-3 rounded-lg ${collapsed ? "justify-center px-1" : "px-3"} py-2.5 text-sm font-medium ${focusRingClass} ${
          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}>
        <Icon className="size-4 shrink-0" aria-hidden="true" /><span className={collapsed ? "sr-only" : undefined}>{item.title}</span>
      </Link>;
    })}
  </nav>;
}
