import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type SessionView = {
 id: string;
 current: boolean;
 createdAt: string;
 lastActivityAt: string;
 expiresAt: string;
};

export const Route = createFileRoute("/account/sessions")({
 component: AccountSessionsPage,
});

/**
 * Security sessions are account-wide and intentionally independent of the
 * current school persona. Current code does not capture device identity:
 * never invent a browser name, operating system or physical location.
 */
function AccountSessionsPage() {
 const [sessions, setSessions] = useState<SessionView[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");

 async function loadSessions() {
  const response = await fetch("/access/sessions", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) {
   window.location.assign("/access");
   return;
  }
  if (!response.ok) throw new Error("Unable to load active sessions.");
  const value: { sessions: SessionView[] } = await response.json();
  setSessions(value.sessions);
 }
 useEffect(() => {
  let active = true;
  setLoading(true);
  void loadSessions().catch(cause => {
   if (active) setError(cause instanceof Error ? cause.message : "Unable to load active sessions.");
  }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, []);

 async function revoke(command: {kind:"one"; sessionId:string} | {kind:"all"}) {
  if (busy) return;
  if (command.kind === "all" && !window.confirm("Sign out every session, including this one?")) return;
  setBusy(true); setError(""); setNotice("");
  try {
   const response = await fetch("/access/sessions", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
   });
   if (response.status === 401) {
    window.location.assign("/access");
    return;
   }
   if (!response.ok) throw new Error("Unable to revoke the selected session.");
   const result: { revokedCount:number; currentRevoked:boolean } = await response.json();
   if (result.currentRevoked) {
    window.location.assign("/access");
    return;
   }
   await loadSessions();
   setNotice(result.revokedCount ? "Session revoked.": "That session was already inactive.");
  } catch (cause) {
   setError(cause instanceof Error ? cause.message : "Unable to revoke session.");
  } finally { setBusy(false); }
 }

 return <main className="mx-auto max-w-3xl px-5 py-10">
  <h1 className="font-serif text-3xl">Account sessions</h1>
  <p className="mt-3 text-sm text-muted-foreground">
   Manage the active sign-ins belonging to your account, across every school membership.
   Revoking a session immediately prevents further authenticated requests from it.
  </p>
  <p className="mt-2 text-xs text-muted-foreground">
   Device names and locations are not collected yet. Sessions are identified by when they began
   and when you last interacted with CAN OS.
  </p>
  {error && <p className="mt-5 rounded-lg border p-3 text-sm" role="alert">{error}</p>}
  {notice && <p className="mt-5 rounded-lg border p-3 text-sm" role="status">{notice}</p>}
  <section className="mt-7 space-y-3" aria-label="Active sessions">
   {loading && <p role="status">Checking active sessions…</p>}
   {!loading && sessions.length === 0 && <p>No active sessions were found for this account.</p>}
   {sessions.map(session => <article key={session.id} className="rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <div>
      <p className="font-semibold">{session.current ? "This session" : "Another active session"}</p>
      <p className="mt-2 text-xs text-muted-foreground">Signed in: {new Date(session.createdAt).toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">Last interaction: {new Date(session.lastActivityAt).toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">Absolute expiration: {new Date(session.expiresAt).toLocaleString()}</p>
     </div>
     <button type="button" disabled={busy}
      onClick={() => void revoke({ kind:"one", sessionId:session.id })}
      className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
      {session.current ? "Sign out this session" : "Revoke session"}
     </button>
    </div>
   </article>)}
  </section>
  <div className="mt-8 border-t pt-5">
   <button type="button" disabled={busy||loading}
    onClick={() => void revoke({kind:"all"})}
    className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
    Sign out everywhere
   </button>
   <p className="mt-2 text-xs text-muted-foreground">
    This revokes every server session for your account, including this session.
   </p>
  </div>
 </main>;
}
