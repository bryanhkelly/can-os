import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ContextTray } from "@/components/workspace";
import type { WorkspaceInstitutionSelection, WorkspaceNavigationItem } from "./workspace-navigation.registry";
import { SidebarLinks } from "./WorkspaceSidebarLinks";

const NotificationTray = lazy(() => import("./NotificationTray").then(module => ({ default: module.NotificationTray })));
const AskCanConversation = lazy(() => import("@/components/conversation/AskCanConversation").then(module => ({ default: module.AskCanConversation })));
const focusRingClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function WorkspaceNavigationPanels({ member, authenticated, accountOpen, onCloseAccount,
  changing, onSignOut, menuOpen, onCloseMenu, links, activePath, institutionSelection, tray, onCloseTray }: {
  member?: { role: string };
  authenticated: boolean;
  accountOpen: boolean;
  onCloseAccount: () => void;
  changing: boolean;
  onSignOut: () => void;
  menuOpen: boolean;
  onCloseMenu: () => void;
  links: readonly WorkspaceNavigationItem[];
  institutionSelection?: WorkspaceInstitutionSelection;
  activePath?: string;
  tray: "notifications" | "ask" | null;
  onCloseTray: () => void;
}) {
  return <>
    {authenticated && <ContextTray title="Account" open={accountOpen} onClose={onCloseAccount}>
      <div className="space-y-2 text-sm">
        <Link to="/profiles" onClick={onCloseAccount} className={`block rounded-lg p-3 hover:bg-muted ${focusRingClass}`}>My profile</Link>
        <Link to="/account/sessions" onClick={onCloseAccount} className={`block rounded-lg p-3 hover:bg-muted ${focusRingClass}`}>Account sessions</Link>
        {member?.role === "student" && <Link to="/student/settings" onClick={onCloseAccount} className={`block rounded-lg p-3 hover:bg-muted ${focusRingClass}`}>Account settings</Link>}
        <Button variant="ghost" size="sm" disabled={changing} onClick={onSignOut} className="w-full justify-start">Sign out</Button>
      </div>
    </ContextTray>}
    {member && <>
      <ContextTray title="Workspace navigation" open={menuOpen} onClose={onCloseMenu}>
        <SidebarLinks links={links} activePath={activePath} institutionSelection={institutionSelection} />
        <Link to="/profiles" className={`mt-3 block rounded-lg border-t p-3 text-sm underline ${focusRingClass}`}>My profile</Link>
        <Link to="/account/sessions" className={`block rounded-lg p-3 text-sm underline ${focusRingClass}`}>Account sessions</Link>
      </ContextTray>
      <ContextTray title="Notifications" open={tray === "notifications"} onClose={onCloseTray} keepMounted>
        <Suspense fallback={<p role="status">Loading notifications...</p>}>
          <NotificationTray onNavigate={onCloseTray} enabled={tray === "notifications"} />
        </Suspense>
      </ContextTray>
      <ContextTray title="Ask CAN" open={tray === "ask"} onClose={onCloseTray}>
        <p className="text-sm text-muted-foreground">Your conversations follow you between workspaces. Answers and proposed actions use your verified permissions; this page does not expand them.</p>
        <Link to="/ask" onClick={onCloseTray} className={`mt-2 inline-block rounded-sm text-sm underline ${focusRingClass}`}>Open full conversation page</Link>
        {member.role === "guardian" && <Link to="/guardian/watching" onClick={onCloseTray} className={`ml-4 inline-block rounded-sm text-sm underline ${focusRingClass}`}>Things CAN Is Watching</Link>}
        <Suspense fallback={<p role="status">Loading Ask CAN...</p>}>
          <AskCanConversation />
        </Suspense>
      </ContextTray>
    </>}
  </>;
}
