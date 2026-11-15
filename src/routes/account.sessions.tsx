import { WorkspaceShell } from "@/components/workspace";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {isSharedDeviceMode,setSharedDeviceMode,registerAccessClient,clearLearnerBrowserState} from "@/domain/session-client";

type SessionView = {
 id: string;
 current: boolean;
 createdAt: string;
 lastActivityAt: string;
 expiresAt:string;
 sharedDevice:boolean;deviceCategory:string|null;
 browserFamily:string|null;osFamily:string|null;
};
type SignalView={signal:string;occurredAt:string};

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
 const [alerts,setAlerts] = useState<SignalView[]>([]);
 const [shared,setShared] = useState(false);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const mutation = useMutationFeedback(loadSessions);
 const busy = mutation.pending || mutation.refreshFailed;

 async function loadSessions() {
  const response = await fetch("/access/sessions", { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) {
   window.location.assign("/access");
   throw new Error("Authentication required to load sessions.");
  }
  if (!response.ok) throw new Error("Unable to load active sessions.");
  const value:{sessions:SessionView[];alerts:SignalView[]} = await response.json();
  setSessions(value.sessions);
  setAlerts(value.alerts??[]);
 }
 useEffect(() => {
  let active=true;
  setShared(isSharedDeviceMode());
  setLoading(true);
  void loadSessions().catch(cause => {
   if (active) setError(mutationErrorMessage(cause, "Unable to load active sessions."));
  }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, []);

 async function revoke(command: {kind:"one"; sessionId:string} | {kind:"all"}) {
  if (busy) return;
  if (command.kind === "all" && !window.confirm("Sign out every session, including this one?")) return;
  setError("");
  let redirected = false;
  await mutation.run(async () => {
   const response = await fetch("/access/sessions", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
   });
   if (response.status === 401) {
    window.location.assign("/access");
    throw new Error("Authentication required to revoke sessions.");
   }
   if (!response.ok) throw new Error("Unable to revoke the selected session.");
   const result: { revokedCount:number; currentRevoked:boolean } = await response.json();
   if (result.currentRevoked) {
    redirected = true;
    clearLearnerBrowserState();
    window.location.assign("/access");
   }
   return result;
  }, { successMessage: result => result.revokedCount ? "Session revoked." : "That session was already inactive.",
   commandErrorMessage: "Unable to revoke session.",
   refresh: async () => { if (!redirected) await loadSessions(); } });
 }

 return <WorkspaceShell width="reading" eyebrow="Account" title="Account sessions" subtitle="Manage the active sign-ins belonging to your account, across every school membership. Revoking a session immediately prevents further authenticated requests from it.">
  <p className="mt-2 text-xs text-muted-foreground">
   Browser and operating system descriptions are approximate. These do not establish physical device identity.
   Network addresses and device identifiers are not displayed.
  </p>
  <label className="mt-5 flex items-center gap-3 border border-border p-4 text-sm">
   <input type="checkbox" checked={shared} onChange={async event=>{
    const enabled=event.target.checked;
    setSharedDeviceMode(enabled);setShared(enabled);
    try{
     const response=await registerAccessClient();
     if(!response.ok)throw new Error("Registration failed");
     await loadSessions();
    }catch{
     setSharedDeviceMode(!enabled);
     setShared(!enabled);
     setError("Unable to synchronize shared-device mode.");
    }
   }}/>
   Shared learning-center device (five-minute inactivity sign-out)
  </label>
  {error && <p className="mt-5 rounded-lg border p-3 text-sm" role="alert">{error}</p>}
  <MutationFeedback state={mutation} className="mt-5" pendingMessage="Revoking account sessions..."/>
  <section className="mt-7 space-y-3" aria-label="Active sessions">
   {loading && <p role="status">Checking active sessions…</p>}
   {!loading && sessions.length === 0 && <p>No active sessions were found for this account.</p>}
   {sessions.map(session => <article key={session.id} className="rounded-xl border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <div>
      <p className="font-semibold">{session.current ? "This session" : "Another active session"}</p>
      <p className="mt-2 text-xs text-muted-foreground">Signed in: {new Date(session.createdAt).toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">Device: {[session.deviceCategory,session.browserFamily,session.osFamily].filter(Boolean).join(" · ")||"Unrecognized"}{session.sharedDevice?" · Shared mode":""}</p>
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
  {alerts.length>0&&<section className="mt-7 border-t pt-5" aria-label="Security observations">
   <h2 className="text-sm font-semibold">Recent security observations</h2>
   <p className="mt-1 text-xs text-muted-foreground">Advisory indicators, not proof of misuse.</p>
   {alerts.map((alert,index)=><p key={index} className="mt-2 text-sm">
    {alert.signal.replaceAll("_"," ")} · {new Date(alert.occurredAt).toLocaleString()}
   </p>)}
  </section>}
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
 </WorkspaceShell>;
}
