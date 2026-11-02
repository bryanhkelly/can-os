import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Home,
  LifeBuoy,
  MessagesSquare,
  ShieldAlert,
  Users,
} from "lucide-react";
import type { WorkspaceNavigationItem } from "./workspace-navigation.registry";

const focusRingClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const navigationIcons = {
  home: Home, book: BookOpen, calendar: CalendarDays, clipboard: ClipboardList,
  support: LifeBuoy, messages: MessagesSquare, safety: ShieldAlert, users: Users,
} satisfies Record<WorkspaceNavigationItem["icon"], typeof Home>;

export function SidebarLinks({ links, activePath }: {
  links: readonly WorkspaceNavigationItem[];
  activePath?: string;
}) {
  return <nav aria-label="CAN OS primary navigation" className="flex-1 space-y-1 overflow-y-auto p-3">
    {links.map(item => {
      const Icon = navigationIcons[item.icon];
      const active = activePath === item.path;

      return <Link key={item.path} to={item.path} aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${focusRingClass} ${
          active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />{item.title}
      </Link>;
    })}
  </nav>;
}
