import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({ component: HomePage });

const workspaceHome: Record<string, string> = {
  student: "/student",
  teacher: "/teacher",
  guardian: "/guardian",
  registrar: "/operations",
  specialist: "/coach",
};

/** Authenticated application entry, never a synthetic-feature showcase. */
function HomePage() {
  const [message, setMessage] = useState("Opening your workspace…");

  useEffect(() => {
    let active = true;
    fetch("/access/session", { credentials: "same-origin" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((session) => {
        if (!active) return;
        if (!session?.authenticated) {
          window.location.replace("/access");
          return;
        }
        const grant = (session.grants ?? []).find(
          (item: { id: string }) => item.id === session.activeGrantId
        );
        const destination = grant && workspaceHome[grant.role];
        if (destination) window.location.replace(destination);
        else setMessage("Your account has no active CAN OS workspace. Contact your school administrator.");
      })
      .catch(() => {
        if (active) setMessage("Unable to load your workspace. Please sign in again.");
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS</p>
      <h1 className="mt-3 font-serif text-4xl">Your school workspace</h1>
      <p role="status" className="mt-5 text-sm text-muted-foreground">{message}</p>
      <Link to="/access" className="mt-6 inline-block rounded-lg border px-4 py-2 text-sm">Sign in</Link>
    </main>
  );
}
