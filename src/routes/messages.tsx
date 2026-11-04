import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { ContactLookup } from "@/components/communication/ContactLookup";
import { MessagesWorkspace } from "@/components/communication/MessagesWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { MutationFeedback, QueryState, WorkspaceShell } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { accessReturnToFromLocation } from "@/domain/access-navigation";
import { getThread, listMyThreads, listThreadContacts, replyToThread, startThread } from "@/modules/communication/messages.functions";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: MessagesPage,
});

type ThreadSummary = Awaited<ReturnType<typeof listMyThreads>>["threads"][number];
type ThreadDetail = Awaited<ReturnType<typeof getThread>>;
type ThreadContact = Awaited<ReturnType<typeof listThreadContacts>>["contacts"][number];

function MessagesPage() {
  const { thread } = Route.useSearch();
  const navigate = Route.useNavigate();
  const returnTo = accessReturnToFromLocation(useLocation());
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const selectedId = thread ?? threads[0]?.id ?? "";
  const selectedRef = useRef(selectedId);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [contacts, setContacts] = useState<ThreadContact[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [threadReloadKey, setThreadReloadKey] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [contactError, setContactError] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);

  async function refreshConversation(id: string) {
    const [updated, list] = await Promise.all([getThread({ data: { threadId: id } }), listMyThreads()]);
    setThreads(list.threads);
    if (selectedRef.current === id) setDetail(updated);
  }
  const mutation = useMutationFeedback(async () => { setThreads((await listMyThreads()).threads); });
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    if (needsSignIn && returnTo) void navigate({ to: "/access", search: { returnTo }, replace: true });
  }, [needsSignIn, navigate, returnTo]);

  function retryLoading() {
    setLoading(true); setError(""); setCanRetry(false); setNeedsSignIn(false);
    setLoadingContacts(true); setContactError("");
    setReloadKey(value => value + 1);
  }

  useEffect(() => {
    let active = true;
    listMyThreads().then(result => {
      if (active) { setThreads(result.threads); setLoading(false); }
    }).catch((cause: unknown) => {
      if (!active) return;
      const failure = normalizeClientError(cause, "Messages are temporarily unavailable. Please try again.");
      setNeedsSignIn(failure.kind === "authentication");
      setCanRetry(failure.kind !== "authentication" && failure.kind !== "authorization");
      setError(failure.kind === "authentication" ? "Sign in to view messages." : failure.message);
      setLoading(false);
    });
    listThreadContacts().then(result => {
      if (active) setContacts(result.contacts);
    }).catch((cause: unknown) => {
      if (active) {
        setContacts([]);
        setContactError(normalizeClientError(cause, "Contacts could not load. Please try again.").message);
      }
    }).finally(() => { if (active) setLoadingContacts(false); });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    setDetail(null); setReply(""); setThreadError("");
    if (!selectedId) { setLoadingThread(false); return; }
    let active = true;
    setLoadingThread(true);
    getThread({ data: { threadId: selectedId } }).then(result => {
      if (active) setDetail(result);
    }).catch((cause: unknown) => {
      if (active) setThreadError(normalizeClientError(cause, "Unable to open this conversation.").message);
    }).finally(() => { if (active) setLoadingThread(false); });
    return () => { active = false; };
  }, [selectedId, threadReloadKey]);

  async function sendReply() {
    const body = reply.trim();
    if (!body || !selectedId) return;
    const id = selectedId;
    const outcome = await mutation.run(() => replyToThread({ data: { threadId: id, body } }), {
      successMessage: "Message sent.",
      commandErrorMessage: "Your message could not be sent. Please try again.",
      refresh: () => refreshConversation(id),
    });
    if ((outcome.status === "saved" || outcome.status === "refresh-failed") && selectedRef.current === id) setReply("");
  }

  async function sendCompose() {
    const subject = composeSubject.trim();
    const body = composeBody.trim();
    if (!composeRecipientId || subject.length < 3 || !body) return;
    const outcome = await mutation.run(async () => {
      const result = await startThread({ data: { recipientPersonId: composeRecipientId, subject, body } });
      setComposeRecipientId(""); setComposeSubject(""); setComposeBody("");
      return result;
    }, {
      successMessage: "Message sent.",
      commandErrorMessage: "Your message could not be sent. Please try again.",
    });
    if (outcome.status === "saved" || outcome.status === "refresh-failed") {
      setComposeOpen(false);
      void navigate({ search: { thread: outcome.value.threadId } });
    }
  }

  const feedback = <MutationFeedback state={mutation} pendingMessage="Sending message..." />;
  return <WorkspaceShell width="wide" eyebrow="Communication / Conversations" title="Messages"
    subtitle="A single place for families, teachers, and school teams to stay connected.">
    {error && <QueryState error={error} onRetry={canRetry ? retryLoading : undefined} />}
    {needsSignIn && <Link to="/access" search={{ returnTo }} className="mt-4 inline-block underline">Sign in or request access</Link>}
    {(!error || threads.length > 0 || thread) && <MessagesWorkspace threads={threads} selectedId={selectedId} detail={detail} loading={loading}
      loadingThread={loadingThread} error={threadError} onRetry={() => setThreadReloadKey(value => value + 1)}
      onSelect={id => { void navigate({ search: { thread: id } }); }}
      reply={reply} onReplyChange={setReply} onSend={() => void sendReply()} busy={busy}
      onCompose={() => setComposeOpen(true)}
      feedback={!composeOpen ? feedback : null} />}
    <Modal open={composeOpen} onClose={() => setComposeOpen(false)} label="New message" dismissible={!busy} busy={busy}>
      <div className="border-b p-5">
        <h2 className="font-serif text-section">New message</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose a contact from your verified school relationships.</p>
      </div>
      <div className="p-5">
        <QueryState loading={loadingContacts ? "Loading contacts..." : undefined} error={contactError || undefined}
          onRetry={retryLoading} isEmpty={!contacts.length}
          empty={<p className="text-sm text-muted-foreground">No one is available to message yet. Contacts appear through your student, class, and guardian relationships.</p>}>
          <form onSubmit={event => { event.preventDefault(); void sendCompose(); }} aria-busy={busy}>
            <fieldset disabled={busy} className="grid gap-4">
              <ContactLookup contacts={contacts} value={composeRecipientId} onChange={setComposeRecipientId} disabled={busy} />
              <label className="grid gap-2 text-sm font-semibold">Subject
                <Input required minLength={3} maxLength={120} value={composeSubject}
                  onChange={event => setComposeSubject(event.target.value)} placeholder="What is this about?" />
              </label>
              <label className="grid gap-2 text-sm font-semibold">Message
                <Textarea required rows={5} maxLength={4000} value={composeBody}
                  onChange={event => setComposeBody(event.target.value)} placeholder="Write a thoughtful message..." />
              </label>
              <Button type="submit" disabled={!composeRecipientId || composeSubject.trim().length < 3 || !composeBody.trim()}>
                <Send aria-hidden="true" />{mutation.pending ? "Sending..." : "Send message"}
              </Button>
            </fieldset>
          </form>
        </QueryState>
        {feedback}
        <Button variant="ghost" className="mt-3" disabled={mutation.pending}
          onClick={() => setComposeOpen(false)}>Cancel</Button>
      </div>
    </Modal>
  </WorkspaceShell>;
}
