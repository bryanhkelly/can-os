import { useEffect, useRef, useState } from "react";
import { ContextTray, EmptyState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { WorkspaceSession } from "@/modules/identity/workspace-session.server";

type AuthenticatedSession = Extract<WorkspaceSession, { authenticated: true }>;
type WorkspaceGrant = AuthenticatedSession["grants"][number];

export function workspaceGrantSearchText(grant: WorkspaceGrant, sites: AuthenticatedSession["sites"]) {
  const site = sites.find(item => item.id === grant.siteId);
  return `${grant.firstName} ${grant.lastName} ${grant.role.replaceAll("_", " ")} ${grant.email ?? ""} ${site?.name ?? ""}`.toLowerCase();
}

export function WorkspaceContextSwitcher({ session, open, changing, error, onClose, onSwitch }: {
  session: AuthenticatedSession;
  open: boolean;
  changing: boolean;
  error: string;
  onClose: () => void;
  onSwitch: (grantId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const current = session.grants.find(grant => grant.id === session.activeGrantId);
  const normalizedQuery = query.trim().toLowerCase();
  const grants = session.grants.filter(grant => workspaceGrantSearchText(grant, session.sites).includes(normalizedQuery));

  function close() {
    setQuery("");
    onClose();
  }
  useEffect(() => {
    if (open && error) errorRef.current?.focus();
  }, [error, open]);

  return <ContextTray title="Switch workspace" open={open} onClose={close}>
    <div className="mb-5 rounded-2xl bg-muted/50 p-4">
      <p className="font-serif text-2xl font-semibold">{current?.firstName} {current?.lastName}</p>
      <p className="mt-1 text-sm capitalize text-muted-foreground">
        {current?.role.replaceAll("_", " ")} · {session.sites.find(site => site.id === current?.siteId)?.name ?? "Authorized workspace"}
      </p>
    </div>
    {session.demoAccountSwitching && <WorkspaceNotice className="mb-4">
      Demo account switching is limited to this session. Each identity is rechecked before selection; changes affect shared demo data and are audited.
    </WorkspaceNotice>}
    {error && <WorkspaceNotice ref={errorRef} tone="danger" className="mb-4">
      No workspace was changed. {error}
    </WorkspaceNotice>}
    <label htmlFor="workspace-switcher-search" className="mb-2 block text-sm font-medium">Search workspaces</label>
    <input id="workspace-switcher-search" type="search" autoComplete="off" value={query}
      onChange={event => setQuery(event.target.value)} placeholder="Search people, roles, or schools…"
      className="mb-5 min-h-11 w-full rounded-xl border bg-background px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
    <div className="space-y-2" aria-busy={changing}>
      {grants.map(grant => {
        const active = grant.id === session.activeGrantId;
        const site = session.sites.find(item => item.id === grant.siteId);
        return <button key={grant.id} type="button" disabled={changing} aria-current={active ? "true" : undefined}
          onClick={() => { if (active) close(); else onSwitch(grant.id); }}
          className="flex min-h-20 w-full flex-col justify-center rounded-xl border bg-card px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold capitalize">
            {grant.role.replaceAll("_", " ")}{active && <StatusBadge tone="success">Active</StatusBadge>}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            {grant.firstName} {grant.lastName}{site ? ` · ${site.name}` : ""}
          </span>
        </button>;
      })}
    </div>
    {!grants.length && <EmptyState title="No workspaces match your search."
      description="Try a person, role, or school name. Only your authorized memberships are shown." />}
  </ContextTray>;
}
