import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { startAssignmentConversation } from "@/modules/learning/class-communication.functions";

export function AssignmentConversation({ assessmentId, studentPersonId }: { assessmentId: string; studentPersonId?: string }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState(false);
  const [threadId, setThreadId] = useState("");
  const requestId = useRef<string | null>(null);
  async function send() {
    if (!body.trim()) { setValidationError(true); return; }
    setValidationError(false);
    setBusy(true); setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const result = await startAssignmentConversation({ data: { assessmentId, studentPersonId, body, messageId: requestId.current } });
      setThreadId(result.threadId); setBody(""); requestId.current = null;
    } catch (cause) { setError(mutationErrorMessage(cause, "Unable to send this assignment message.")); }
    finally { setBusy(false); }
  }
  return <details className="mt-5 rounded-xl border p-4">
    <summary className="cursor-pointer text-sm font-semibold">Discuss this assignment</summary>
    <p className="mt-3 text-sm text-muted-foreground">Messages are shared with the student, academically authorized guardians, and the class teaching team—not a private teacher note.</p>
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
    {threadId && <p role="status" className="mt-3 text-sm">Message sent. <Link to="/messages" search={{ thread: threadId }} className="underline">Open assignment conversation</Link></p>}
    <form noValidate onSubmit={event => { event.preventDefault(); void send(); }} className="mt-3 grid gap-3">
      <Field label="Message" required error={validationError ? "Enter a message." : undefined}>
        <Textarea rows={3} maxLength={4000} disabled={busy} value={body}
          onChange={event => {
            setBody(event.target.value);
            requestId.current = null;
            if (event.target.value.trim()) setValidationError(false);
          }} />
      </Field>
      <Button type="submit" disabled={busy} className="justify-self-start">{busy ? "Sending..." : "Send message"}</Button>
    </form>
  </details>;
}
