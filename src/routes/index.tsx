import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { workspaceHome } from "@/components/shell/WorkspaceNavigation";

export const Route = createFileRoute("/")({ component: HomePage });

/** Authenticated application entry, never a synthetic-feature showcase. */
function HomePage() {
  const { session, error } = useWorkspaceSession();
  if (session && !session.authenticated) return <Navigate to="/access" replace />;
  const destination = session?.authenticated ? workspaceHome[session.role] : undefined;
  if (destination) return <Navigate to={destination} replace />;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS</p>
      <h1 className="mt-3 font-serif text-4xl">Your school workspace</h1>
      <p role={error ? "alert" : "status"} className="mt-5 text-sm text-muted-foreground">
        {error ?? "Your account has no active CAN OS workspace. Contact your school administrator."}
      </p>
      <Link to="/access" className="mt-6 inline-block rounded-lg border px-4 py-2 text-sm">Sign in</Link>
    </main>
  );
}
