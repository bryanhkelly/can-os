import { Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextTray, WorkspaceNotice } from "@/components/workspace";

const focusRingClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Shared account trigger for the ordinary workspace and every Launch Studio shell. */
export function WorkspaceAccountTrigger({ member, accountOpen, onOpenAccount }: {
  member?: { firstName: string; lastName: string };
  accountOpen: boolean;
  onOpenAccount: () => void;
}) {
  return <Button variant="ghost" size="icon" aria-label="Account menu"
    aria-haspopup="dialog" aria-expanded={accountOpen}
    title={member ? `${member.firstName} ${member.lastName}` : "My CAN account"}
    aria-description={member ? `Signed in as ${member.firstName} ${member.lastName}` : undefined}
    onClick={onOpenAccount} className="border bg-muted">
    <UserRound aria-hidden="true" />
  </Button>;
}

/** One verified account menu and sign-out destination across all shells.
 * The caller provides the existing access-session revocation action.
 */
export function WorkspaceAccountMenu({ member, accountOpen, onCloseAccount,
  changing, onSignOut, error }: {
  member?: { role: string };
  accountOpen: boolean;
  onCloseAccount: () => void;
  changing: boolean;
  onSignOut: () => void;
  error?: string;
}) {
  return <ContextTray title="Account" open={accountOpen} onClose={onCloseAccount}>
    <div className="space-y-2 text-sm">
      {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
      <Link to="/account" onClick={onCloseAccount}
        className={`block p-3 font-semibold hover:bg-muted ${focusRingClass}`}>My CAN account</Link>
      <Link to="/profiles" onClick={onCloseAccount}
        className={`block p-3 hover:bg-muted ${focusRingClass}`}>My profile</Link>
      <Link to="/account/sessions" onClick={onCloseAccount}
        className={`block p-3 hover:bg-muted ${focusRingClass}`}>Account sessions</Link>
      {member?.role === "student" && <Link to="/student/settings" onClick={onCloseAccount}
        className={`block p-3 hover:bg-muted ${focusRingClass}`}>Account settings</Link>}
      <Button variant="ghost" size="sm" disabled={changing} onClick={onSignOut}
        className="w-full justify-start">Sign out</Button>
    </div>
  </ContextTray>;
}
