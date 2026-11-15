import { createFileRoute, Link, redirect, useLocation } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
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
    <WorkspaceShell width="reading" title="Return to CAN OS" eyebrow="CAN OS">
      <section className="mt-6 border border-border bg-card p-6">
        <p role="status">The requested page could not be opened. No account access changes were made.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {destination && <Link to={destination} className="inline-flex min-h-11 items-center border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open my workspace</Link>}
          <Link to="/explore" className="inline-flex min-h-11 items-center border border-border px-4 py-2 text-sm font-semibold text-primary">Explore programs</Link>
          {!signedIn && <Link to="/access" search={{returnTo:"/"}} className="inline-flex min-h-11 items-center border border-border px-4 py-2 text-sm font-semibold text-primary">Sign in</Link>}
        </div>
      </section>
    </WorkspaceShell>
  );

  return (
    <WorkspaceShell width="reading" eyebrow="CAN OS"
      title={signedIn ? "Your CAN workspace" : "Access CAN OS"}
      subtitle="One account connects your learning, schools, sites and programs.">
      <section className="mt-6 border border-border bg-card p-6">
        <p role={error ? "alert" : "status"} className="text-sm leading-6 text-muted-foreground">
          {error ?? (signedIn
            ? "You are signed in, but no active workspace is assigned to your current role. Your personal CAN account and published programs remain accessible."
            : "Sign in to access your CAN workspace or explore the published program directory.")}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {signedIn ? <>
            <Link to="/account/" className="inline-flex min-h-11 items-center border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">My CAN account</Link>
            <Link to="/learn/my-programs" className="inline-flex min-h-11 items-center border border-border px-4 py-2 text-sm font-semibold text-primary">My Learning & Programs</Link>
          </> : <Link to="/access" search={{returnTo:"/"}} className="inline-flex min-h-11 items-center border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in</Link>}
          <Link to="/explore" className="inline-flex min-h-11 items-center border border-border px-4 py-2 text-sm font-semibold text-primary">Explore programs</Link>
        </div>
      </section>
    </WorkspaceShell>
  );
}
