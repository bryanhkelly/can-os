import { Link } from "@tanstack/react-router";
import { Bell, ChevronDown, Menu, MessageCircle, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { getWorkspaceScopeLabel } from "./workspace-scope";

export function WorkspaceTopBar({ member, sites, authenticated, sessionAvailable, sessionError,
  error, demoAccountSwitching, changing, menuOpen, switcherOpen, accountOpen, onToggleMenu,
  onOpenSwitcher, onOpenSearch, onOpenAsk, onOpenNotifications, onOpenAccount }: {
  member?: { role: string; firstName: string; lastName: string; siteId: string | null };
  sites: readonly { id: string; name: string }[];
  authenticated: boolean;
  sessionAvailable: boolean;
  sessionError: string | null;
  error: string;
  demoAccountSwitching: boolean;
  changing: boolean;
  menuOpen: boolean;
  switcherOpen: boolean;
  accountOpen: boolean;
  onToggleMenu: () => void;
  onOpenSwitcher: () => void;
  onOpenSearch: () => void;
  onOpenAsk: () => void;
  onOpenNotifications: () => void;
  onOpenAccount: () => void;
}) {
  return <header aria-label="Workspace top bar" className="sticky top-0 z-30 border-b bg-card px-4 py-3 sm:px-6">
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      {member && <Button variant="outline" size="icon"
        aria-label={menuOpen ? "Close workspace navigation" : "Open workspace navigation"}
        aria-expanded={menuOpen} onClick={onToggleMenu} className="lg:hidden">
        <Menu aria-hidden="true" />
      </Button>}
      {member
        ? <Button variant="outline" disabled={changing} aria-haspopup="dialog"
          aria-expanded={switcherOpen} onClick={onOpenSwitcher}
          className="mr-auto flex min-w-0 max-w-[min(65vw,22rem)] items-center justify-start gap-2 rounded-xl border-border/70 bg-background px-3 py-2 text-left">
          <span className="sr-only">Switch workspace:</span>{" "}
          <span className="shrink-0 font-serif text-lg font-semibold">CAN OS</span>{" "}
          <span className="min-w-0 border-l pl-2">
            <span className="block text-xs font-semibold capitalize">{member.role.replaceAll("_", " ")}</span>{" "}
            <span className="block truncate text-xs text-muted-foreground">
              {getWorkspaceScopeLabel(member, sites)}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
        : <Link to="/" className="mr-auto rounded-sm font-serif text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">CAN OS</Link>}
      {member && <>
        <Button variant="outline" size="sm" aria-label="Search workspace" aria-haspopup="dialog"
          title="Find pages and authorized records (Ctrl+K / Cmd+K)" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
          <span>Search</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenAsk} aria-label="Ask CAN" aria-haspopup="dialog"
          title="Ask the CAN assistant for help">
          <MessageCircle aria-hidden="true" />
          <span className="hidden sm:inline">Ask CAN</span>
        </Button>
        <Button variant="outline" size="icon" onClick={onOpenNotifications} aria-label="Notifications" aria-haspopup="dialog">
          <Bell aria-hidden="true" />
        </Button>
      </>}
      {authenticated
        ? <Button variant="ghost" size="icon" aria-label="Account menu" aria-haspopup="dialog" aria-expanded={accountOpen}
          onClick={onOpenAccount} className="rounded-full border bg-muted"><UserRound aria-hidden="true" /></Button>
        : sessionAvailable && <Link to="/access" className="rounded-lg px-2 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">Sign in</Link>}
      {(error || sessionError) && <WorkspaceNotice tone="danger" className="w-full">{error || sessionError}</WorkspaceNotice>}
      {demoAccountSwitching && <WorkspaceNotice className="w-full">
        Demo admin session: acting as {member?.firstName} {member?.lastName} ({member?.role}). Changes affect shared demo data. User switches are audited.
      </WorkspaceNotice>}
    </div>
  </header>;
}
