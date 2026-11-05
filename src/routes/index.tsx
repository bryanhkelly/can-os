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
  if (recovered) return (
    <WorkspaceShell title="Home" eyebrow="CAN OS">
      <p role="status">The previous page could not be opened with your current account. You are home.</p>
      {destination && <Link to={destination} className="mt-4 inline-block underline">Open my workspace</Link>}
    </WorkspaceShell>
  );

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS</p>
      <h1 className="mt-3 font-serif text-4xl">Your school workspace</h1>
      <p role={error ? "alert" : "status"} className="mt-5 text-sm text-muted-foreground">
        {error ?? "Your account has no active CAN OS workspace. Contact your school administrator."}
      </p>
      <Link to="/access" search={{returnTo:"/"}} className="mt-6 inline-block rounded-lg border px-4 py-2 text-sm">Sign in</Link>
    </main>
  );
}
