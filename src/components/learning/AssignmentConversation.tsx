import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { startAssignmentConversation } from "@/modules/learning/class-communication.functions";

export function AssignmentConversation({ assessmentId, studentPersonId }: { assessmentId: string; studentPersonId?: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [threadId, setThreadId] = useState("");
  const requestId = useRef<string | null>(null);
  async function send() {
    setBusy(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await startAssignmentConversation({ data: { assessmentId, studentPersonId, body, messageId: requestId.current } });
      setThreadId(result.threadId); setBody(""); requestId.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send this assignment message."); }
    finally { setBusy(false); }
  }
  return <details className="mt-5 rounded-xl border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Discuss this assignment</summary>
    <p className="mt-3 text-sm text-muted-foreground">Messages are shared with the student, academically authorized guardians, and the class teaching team—not a private teacher note.</p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {threadId && <p role="status" className="mt-3 text-sm">Message sent. <Link to="/messages" search={{ thread: threadId }} className="underline">Open assignment conversation</Link></p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="mt-3 grid gap-3">
      <label className="text-sm">Message<textarea rows={3} maxLength={4000} disabled={busy} value={body}
        onChange={event => { setBody(event.target.value); requestId.current = null; }} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
      <button disabled={busy || !body.trim()} className="justify-self-start rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">{busy ? "Sending..." : "Send message"}</button>
    </form>
  </details>;
}
