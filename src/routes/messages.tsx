import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { ContactLookup } from "@/components/communication/ContactLookup";
import { MessagesWorkspace } from "@/components/communication/MessagesWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { MutationFeedback, QueryState, WorkspaceShell } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { accessReturnToFromLocation } from "@/domain/access-navigation";
import { getThread, listMyThreads, listThreadContacts, replyToThread, startThread } from "@/modules/communication/messages.functions";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { thread } = Route.useSearch();
  const navigate = Route.useNavigate();
  const returnTo = accessReturnToFromLocation(useLocation());
  const queryClient = useQueryClient();
  const { session } = useWorkspaceSession();
  const grantId = session?.authenticated ? session.activeGrantId : "anonymous";
  const [composeOpen, setComposeOpen] = useState(false);
  const threadsKey = ["messages", "threads", grantId] as const;
  const contactsKey = ["messages", "contacts", grantId] as const;
  const threadsQuery = useQuery({
    queryKey: threadsKey,
    queryFn: () => listMyThreads(),
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const contactsQuery = useQuery({
    queryKey: contactsKey,
    queryFn: () => listThreadContacts(),
    enabled: composeOpen,
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const threads = threadsQuery.data?.threads ?? [];
  const selectedId = thread ?? threads[0]?.id ?? "";
  const detailQuery = useQuery({
    queryKey: ["messages", "thread", grantId, selectedId],
    queryFn: () => getThread({ data: { threadId: selectedId } }),
    enabled: Boolean(selectedId),
    retry: (count, error) => normalizeClientError(error).retryable && count < 1,
  });
  const detail = detailQuery.data ?? null;
  const [reply, setReply] = useState("");
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttempted, setComposeAttempted] = useState(false);
  const composeRecipientError = composeAttempted && !composeRecipientId ? "Choose a recipient." : undefined;
  const composeSubjectError = composeAttempted && !composeSubject.trim() ? "Enter a subject." : undefined;
  const composeBodyError = composeAttempted && !composeBody.trim() ? "Enter a message." : undefined;
  const threadsFailure = threadsQuery.error
    ? normalizeClientError(threadsQuery.error, "Messages are temporarily unavailable. Please try again.")
    : null;
  const detailFailure = detailQuery.error
    ? normalizeClientError(detailQuery.error, "Unable to open this conversation.")
    : null;
  const contactsFailure = contactsQuery.error
    ? normalizeClientError(contactsQuery.error, "Contacts could not load. Please try again.")
    : null;
  const needsSignIn = threadsFailure?.kind === "authentication";
  const contacts = contactsQuery.data?.contacts ?? [];

  async function refreshConversation(id: string) {
    const [updated, list] = await Promise.all([getThread({ data: { threadId: id } }), listMyThreads()]);
    queryClient.setQueryData(threadsKey, list);
    queryClient.setQueryData(["messages", "thread", grantId, id], updated);
  }
  const mutation = useMutationFeedback(async () => {
    await queryClient.invalidateQueries({ queryKey: threadsKey });
  });
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    if (needsSignIn && returnTo) void navigate({ to: "/access", search: { returnTo }, replace: true });
  }, [needsSignIn, navigate, returnTo]);

  const retryLoading = () => void threadsQuery.refetch();

  async function sendReply() {
    const body = reply.trim();
    if (!body || !selectedId) return;
    const id = selectedId;
    const outcome = await mutation.run(() => replyToThread({ data: { threadId: id, body } }), {
      successMessage: "Message sent.",
      commandErrorMessage: "Your message could not be sent. Please try again.",
      refresh: () => refreshConversation(id),
    });
    if ((outcome.status === "saved" || outcome.status === "refresh-failed") && selectedId === id) setReply("");
  }

  async function sendCompose() {
    const subject = composeSubject.trim();
    const body = composeBody.trim();
    setComposeAttempted(true);
    if (!composeRecipientId || !subject || !body) return;
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
      setReply("");
      void navigate({ search: { thread: outcome.value.threadId } });
    }
  }

  const feedback = <MutationFeedback state={mutation} pendingMessage="Sending message..." />;
  return <WorkspaceShell width="wide" eyebrow="Communication / Conversations" title="Messages"
    subtitle="A single place for families, teachers, and school teams to stay connected.">
    {threadsFailure && <QueryState error={needsSignIn ? "Sign in to view messages." : threadsFailure.message}
      onRetry={threadsFailure.retryable ? retryLoading : undefined} retrying={threadsQuery.isFetching} />}
    {needsSignIn && <Link to="/access" search={{ returnTo }} className="mt-4 inline-block underline">Sign in or request access</Link>}
    {(!threadsFailure || threads.length > 0 || thread) && <MessagesWorkspace threads={threads} selectedId={selectedId} detail={detail} loading={threadsQuery.isPending}
      loadingThread={detailQuery.isPending} error={detailFailure?.message ?? ""}
      onRetry={() => { if (detailFailure?.retryable) void detailQuery.refetch(); }}
      onSelect={id => { setReply(""); void navigate({ search: { thread: id } }); }}
      reply={reply} onReplyChange={setReply} onSend={() => void sendReply()} busy={busy}
      onCompose={() => { setComposeAttempted(false); setComposeOpen(true); }}
      feedback={!composeOpen ? feedback : null} />}
    <Modal open={composeOpen} onClose={() => setComposeOpen(false)} label="New message" dismissible={!busy} busy={busy}>
      <div className="border-b p-5">
        <h2 className="font-serif text-section">New message</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose a contact from your verified school relationships.</p>
      </div>
      <div className="p-5">
        <QueryState loading={contactsQuery.isPending ? "Loading contacts..." : undefined}
          error={contactsFailure?.message}
          onRetry={contactsFailure?.retryable ? () => void contactsQuery.refetch() : undefined} retrying={contactsQuery.isFetching} isEmpty={!contacts.length}
          empty={<p className="text-sm text-muted-foreground">No one is available to message yet. Contacts appear through your student, class, and guardian relationships.</p>}>
          <form noValidate onSubmit={event => { event.preventDefault(); void sendCompose(); }} aria-busy={busy}>
            <fieldset disabled={busy} className="grid gap-4">
              <ContactLookup contacts={contacts} value={composeRecipientId} onChange={setComposeRecipientId} disabled={busy} />
              {composeRecipientError && <p role="alert" className="text-sm text-destructive">{composeRecipientError}</p>}
              <Field label="Subject" required error={composeSubjectError}>
                <Input maxLength={120} value={composeSubject}
                  onChange={event => setComposeSubject(event.target.value)} placeholder="What is this about?" />
              </Field>
              <Field label="Message" required error={composeBodyError}>
                <Textarea rows={5} maxLength={4000} value={composeBody}
                  onChange={event => setComposeBody(event.target.value)} placeholder="Write a thoughtful message..." />
              </Field>
              <Button type="submit" disabled={busy}>
                <Send aria-hidden="true" />{mutation.pending ? "Sending..." : "Send message"}
              </Button>
            </fieldset>
          </form>
        </QueryState>
        {feedback}
        <Button variant="ghost" className="mt-3" disabled={mutation.pending}
          onClick={() => { setComposeAttempted(false); setComposeOpen(false); }}>Cancel</Button>
      </div>
    </Modal>
  </WorkspaceShell>;
}
