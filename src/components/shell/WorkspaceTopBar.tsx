import { Link, useLocation } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Bell, ChevronDown, Menu, MessageCircle, Search } from "lucide-react";
import { WorkspaceAccountTrigger } from "./WorkspaceAccountMenu";
import { PlatformOwnerDelegationBanner } from "./PlatformOwnerDelegationBanner";
import { Button } from "@/components/ui/button";
import { focusRingClasses } from "@/components/ui/control-styles";
import { cn } from "@/lib/utils";
import { WorkspaceNotice } from "@/components/workspace";
import { formatWorkspaceRole, getWorkspaceScopeLabel } from "./workspace-scope";
import { accessReturnToFromLocation, safeAccessReturnTo } from "@/domain/access-navigation";
import { useHydrated } from "@/lib/use-hydrated";

export function WorkspaceTopBar({ member, sites, authenticated, sessionAvailable, sessionError,
  error, demoAccountSwitching, ownerDelegation, changing, menuOpen, switcherOpen, accountOpen, onToggleMenu,
  onOpenSwitcher, onOpenSearch, onOpenAsk, onOpenNotifications, onOpenAccount, focused = false, notificationsOpen = false }: {
  member?: { role: string; firstName: string; lastName: string; siteId: string | null };
  sites: readonly { id: string; name: string }[];
  authenticated: boolean;
  sessionAvailable: boolean;
  sessionError: string | null;
  error: string;
  demoAccountSwitching: boolean;
  ownerDelegation?: {mode:"view"|"act";expiresAt:string};
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
  const demoContext = JSON.stringify([demoAccountSwitching, member]);
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
          className="mr-auto flex h-auto min-w-0 max-w-[22rem] shrink items-center justify-start gap-2  border-border/70 bg-background px-3 py-1.5 text-left">
          <span className="sr-only">Switch workspace:</span>{" "}
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">{formatWorkspaceRole(member.role)}</span>{" "}
            <span className="block truncate text-xs text-muted-foreground">
              {getWorkspaceScopeLabel(member, sites)}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
        : <Link to="/" className={cn("mr-auto font-serif text-xl font-semibold",focusRingClasses)}>CAN OS</Link>}
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
        ? <WorkspaceAccountTrigger member={member} accountOpen={accountOpen} onOpenAccount={onOpenAccount} />
        : sessionAvailable && <Button asChild variant="outline" size="lg"><Link to="/access" search={{returnTo}}>Sign in</Link></Button>}
    </div>
  </header>
  <div className="space-y-2 px-[var(--page-gutter)] empty:hidden [&:not(:empty)]:pt-3">
      {(error || sessionError) && <WorkspaceNotice tone="danger" className="w-full">{error || sessionError}</WorkspaceNotice>}
      {ownerDelegation && <PlatformOwnerDelegationBanner mode={ownerDelegation.mode}
        expiresAt={ownerDelegation.expiresAt}
        targetLabel={member ? member.firstName+" "+member.lastName+" ("+formatWorkspaceRole(member.role)+")" : "Selected user"}/>}
      {demoAccountSwitching && dismissedDemoContext !== demoContext && <WorkspaceNotice className="w-full"
        onDismiss={dismissDemoNotice} dismissLabel="Dismiss demo information">
        <span className="sm:hidden">Demo session as {member?.firstName} ({member && formatWorkspaceRole(member.role)}). Shared data; switches audited.</span>
        <span className="hidden sm:inline">Demo admin session: acting as {member?.firstName} {member?.lastName} ({member && formatWorkspaceRole(member.role)}). Changes affect shared demo data. User switches are audited.</span>
      </WorkspaceNotice>}

  </div>
  </>;
}
