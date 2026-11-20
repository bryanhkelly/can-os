import { createFileRoute, Link, redirect, useLocation } from "@tanstack/react-router";
import { WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { useWorkspaceSession, workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";
import { defaultStudentDisplayPreferences, studentHomePath } from "@/domain/student-display-preferences";

export const Route = createFileRoute("/")({
  loader: async ({ context, location }) => {
    const { session, error } = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (location.state.accessReturnFailed === true || error) return;
    if (session && !session.authenticated) {
      throw redirect({ to: "/access", search: { returnTo: "/" } });
    }
    if (!session?.authenticated) return;
    if (session.role==="academic_content_creator") throw redirect({to:"/class",search:{view:"content"}});
    if (session.role==="academic_content_reviewer") throw redirect({to:"/class",search:{view:"reviews"}});
    const destination = session.role === "student"
      ? studentHomePath(session.studentPreferences ?? defaultStudentDisplayPreferences)
      : getWorkspaceHome(session.role);
    if (destination && destination !== "/") throw redirect({ to: destination });
  },
  component: HomePage,
});

/** Authenticated application entry, never a synthetic-feature showcase. */
function HomePage() {
  const { session, error } = useWorkspaceSession();
  const recovered = useLocation({ select: location => location.state.accessReturnFailed === true });
  const destination = session?.authenticated ? session.role==="student"
    ? studentHomePath(session.studentPreferences??defaultStudentDisplayPreferences)
    : getWorkspaceHome(session.role) : undefined;
  const signedIn = session?.authenticated === true;
  if (recovered) return (
    <WorkspaceShell width="reading" title="Return to CAN OS" eyebrow="Workspace access">
      <WorkspacePanel title="Next steps" className="mt-6">
        <p role="status">The requested page could not be opened. No account access changes were made.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {destination && <Button asChild><Link to={destination}>Open my workspace</Link></Button>}
          <Button asChild variant="outline"><Link to="/explore">Explore programs</Link></Button>
          {!signedIn && <Button asChild variant="outline"><Link to="/access" search={{returnTo:"/"}}>Sign in</Link></Button>}
        </div>
      </WorkspacePanel>
    </WorkspaceShell>
  );

  return (
    <WorkspaceShell width="reading" eyebrow="Workspace access"
      title={signedIn ? "Your CAN workspace" : "Access CAN OS"}
      subtitle="One account connects your learning, schools, sites and programs.">
      <WorkspacePanel title="Next steps" className="mt-6">
        <p role={error ? "alert" : "status"} className="text-sm leading-6 text-muted-foreground">
          {error ?? (signedIn
            ? "You are signed in, but no active workspace is assigned to your current role. Your personal CAN account and published programs remain accessible."
            : "Sign in to access your CAN workspace or explore the published program directory.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {signedIn ? <>
            <Button asChild><Link to="/account">My CAN account</Link></Button>
            <Button asChild variant="outline"><Link to="/learn/my-activity">My Activity</Link></Button>
          </> : <Button asChild><Link to="/access" search={{returnTo:"/"}}>Sign in</Link></Button>}
          <Button asChild variant="outline"><Link to="/explore">Explore programs</Link></Button>
        </div>
      </WorkspacePanel>
    </WorkspaceShell>
  );
}
