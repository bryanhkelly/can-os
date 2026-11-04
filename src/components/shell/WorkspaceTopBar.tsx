import { Link, useLocation } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Bell, ChevronDown, Menu, MessageCircle, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { formatWorkspaceRole, getWorkspaceScopeLabel } from "./workspace-scope";
import { accessReturnToFromLocation, safeAccessReturnTo } from "@/domain/access-navigation";
import { useHydrated } from "@/lib/use-hydrated";

export function WorkspaceTopBar({ member, sites, authenticated, sessionAvailable, sessionError,
  error, demoAccountSwitching, demoTenant, changing, menuOpen, switcherOpen, accountOpen, onToggleMenu,
  onOpenSwitcher, onOpenSearch, onOpenAsk, onOpenNotifications, onOpenAccount, focused = false, notificationsOpen = false }: {
  member?: { role: string; firstName: string; lastName: string; siteId: string | null };
  sites: readonly { id: string; name: string }[];
  authenticated: boolean;
  sessionAvailable: boolean;
  sessionError: string | null;
  error: string;
  demoAccountSwitching: boolean;
  demoTenant?: boolean;
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
  focused?: boolean;
  notificationsOpen?: boolean;
}) {
  const location=useLocation();
  const hydrated=useHydrated();
  const returnTo=location.pathname === "/access" || location.pathname === "/access/"
    ? safeAccessReturnTo(new URLSearchParams(location.searchStr).get("returnTo"))
    : accessReturnToFromLocation({ ...location, hash: hydrated ? location.hash : "" });
  const switcherRef = useRef<HTMLButtonElement>(null);
  const [dismissedDemoContext, setDismissedDemoContext] = useState<string | null>(null);
  const demoContext = JSON.stringify([demoAccountSwitching, demoTenant, member]);
  const dismissDemoNotice = () => {
    setDismissedDemoContext(demoContext);
    switcherRef.current?.focus();
  };
  return <>
  <header aria-label="Workspace top bar" className="can-shell-bar sticky top-0 z-30 flex h-[var(--topbar-height)] items-center border-b bg-card px-[var(--page-gutter)]">
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
      {member && !focused && <Button variant="outline" size="icon"
        aria-label={menuOpen ? "Close workspace navigation" : "Open workspace navigation"}
        aria-expanded={menuOpen} onClick={onToggleMenu} className="lg:hidden">
        <Menu aria-hidden="true" />
      </Button>}
      {member
        ? <Button ref={switcherRef} variant="outline" disabled={changing} aria-haspopup="dialog"
          aria-expanded={switcherOpen} onClick={onOpenSwitcher}
          className="mr-auto flex h-auto min-w-0 max-w-[22rem] shrink items-center justify-start gap-2 rounded-xl border-border/70 bg-background px-3 py-1.5 text-left">
          <span className="sr-only">Switch workspace:</span>{" "}
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{formatWorkspaceRole(member.role)}</span>{" "}
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
          <span className="hidden sm:inline">Search</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenAsk} aria-label="Ask CAN" aria-haspopup="dialog"
          title="Ask the CAN assistant for help">
          <MessageCircle aria-hidden="true" />
          <span className="hidden sm:inline">Ask CAN</span>
        </Button>
        <Button variant="outline" size="icon" onClick={onOpenNotifications} aria-label="Notifications" aria-haspopup="dialog" aria-expanded={notificationsOpen}>
          <Bell aria-hidden="true" />
        </Button>
      </>}
      {authenticated
        ? <Button variant="ghost" size="icon" aria-label="Account menu" aria-haspopup="dialog" aria-expanded={accountOpen}
          title={member ? `${member.firstName} ${member.lastName}` : undefined}
          aria-description={member ? `Signed in as ${member.firstName} ${member.lastName}` : undefined}
          onClick={onOpenAccount} className="rounded-full border bg-muted"><UserRound aria-hidden="true" /></Button>
        : sessionAvailable && <Link to="/access" search={{returnTo}} className="rounded-lg px-2 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">Sign in</Link>}
    </div>
  </header>
  <div className="space-y-2 px-[var(--page-gutter)] empty:hidden [&:not(:empty)]:pt-3">
      {(error || sessionError) && <WorkspaceNotice tone="danger" className="w-full">{error || sessionError}</WorkspaceNotice>}
      {demoAccountSwitching && dismissedDemoContext !== demoContext && <WorkspaceNotice className="w-full"
        onDismiss={dismissDemoNotice} dismissLabel="Dismiss demo information">
        <span className="sm:hidden">Demo session as {member?.firstName} ({member && formatWorkspaceRole(member.role)}). Shared data; switches audited.</span>
        <span className="hidden sm:inline">Demo admin session: acting as {member?.firstName} {member?.lastName} ({member && formatWorkspaceRole(member.role)}). Changes affect shared demo data. User switches are audited.</span>
      </WorkspaceNotice>}
      {demoTenant && !demoAccountSwitching && dismissedDemoContext !== demoContext && <WorkspaceNotice className="w-full"
        onDismiss={dismissDemoNotice} dismissLabel="Dismiss demo information">
        <span className="sm:hidden">Demo school: synthetic, shared data only. Email and SMS suppressed.</span>
        <span className="hidden sm:inline">Demo school: use synthetic data only. These shared accounts and changes are visible to other participants. External email and SMS are suppressed.</span>
      </WorkspaceNotice>}
  </div>
  </>;
}
