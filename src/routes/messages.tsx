import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getThread,
  listMyThreads,
  listThreadContacts,
  replyToThread,
  startThread,
} from "@/modules/communication/messages.functions";

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: MessagesPage,
});

type ThreadSummary = Awaited<ReturnType<typeof listMyThreads>>["threads"][number];
type ThreadDetail = Awaited<ReturnType<typeof getThread>>;
type ThreadContact = Awaited<ReturnType<typeof listThreadContacts>>["contacts"][number];

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function MessagesPage() {
  const { thread } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const selectedId = thread ?? threads[0]?.id ?? "";
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentNotice, setSentNotice] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<ThreadContact[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState("");

  useEffect(() => {
    let active = true;
    listMyThreads()
      .then((result) => {
        if (!active) return;
        setThreads(result.threads);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError("Sign in to view messages.");
          setLoading(false);
        }
      });
    listThreadContacts()
      .then((result) => {
        if (active) setContacts(result.contacts);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const openThread = (threadId: string) => {
    void navigate({ search: { thread: threadId } });
  };

  useEffect(() => {
    setDetail(null);
    setReply("");
    setSentNotice(false);
    if (!selectedId) return;
    let active = true;
    setError("");
    setLoadingThread(true);
    getThread({ data: { threadId: selectedId } })
      .then((result) => { if (active) setDetail(result); })
      .catch(() => { if (active) setError("Unable to open this conversation."); })
      .finally(() => { if (active) setLoadingThread(false); });
    return () => { active = false; };
  }, [selectedId]);

  const sendReply = () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    setSentNotice(false);
    replyToThread({ data: { threadId: selectedId, body } })
      .then(async () => {
        setReply("");
        setSentNotice(true);
        try {
          const [updated, list] = await Promise.all([
            getThread({ data: { threadId: selectedId } }),
            listMyThreads(),
          ]);
          setDetail(updated);
          setThreads(list.threads);
        } catch {
          // The write succeeded; failure to refresh is not a failed send.
          setError("Message sent, but the conversation could not be refreshed. Reopen it to see the reply.");
        }
      })
      .catch(() => setError("Your message could not be sent. Please try again."))
      .finally(() => setSending(false));
  };

  const sendCompose = () => {
    const subject = composeSubject.trim();
    const body = composeBody.trim();
    if (!composeRecipientId || subject.length < 3 || !body || composing) return;
    setComposing(true);
    setComposeError("");
    startThread({
      data: { recipientPersonId: composeRecipientId, subject, body },
    })
      .then(async ({ threadId }) => {
        setComposeOpen(false);
        setComposeRecipientId("");
        setComposeSubject("");
        setComposeBody("");
        // The message was committed; open its thread even if the inbox
        // projection fails. A refresh error must not invite a duplicate send.
        openThread(threadId);
        try {
          const list = await listMyThreads();
          setThreads(list.threads);
        } catch {
          setError("Message sent. The inbox list could not be refreshed; your new conversation is open.");
        }
      })
      .catch(() => setComposeError("Your message could not be sent. Please try again."))
      .finally(() => setComposing(false));
  };

  if (error && !threads.length && !thread) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Messages</p>
          <h1 className="mt-2 font-serif text-4xl">Messages</h1>
          <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Messages</p>
        <h1 className="mt-2 font-serif text-4xl">Messages</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Conversations connected to your students, assignments, and school.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setComposeOpen((open) => !open);
              setComposeError("");
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            New message
          </button>
        </div>
        {composeOpen && (
          <section className="mt-6 rounded-xl border bg-card p-5" aria-label="New message">
            <h2 className="text-lg font-semibold">New message</h2>
            {contacts.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No one is available to message yet. Contacts appear here through your
                student, class, and guardian relationships.
              </p>
            ) : (
              <form
                className="mt-4 grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendCompose();
                }}
              >
                <label className="block text-sm font-semibold">
                  To
                  <select
                    className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
                    value={composeRecipientId}
                    onChange={(event) => setComposeRecipientId(event.target.value)}
                  >
                    <option value="">Choose a recipient…</option>
                    {contacts.map((contact) => (
                      <option key={contact.personId} value={contact.personId}>
                        {contact.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Subject
                  <input
                    className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
                    maxLength={120}
                    value={composeSubject}
                    onChange={(event) => setComposeSubject(event.target.value)}
                    placeholder="What is this about?"
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Message
                  <textarea
                    className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
                    rows={4}
                    maxLength={4000}
                    value={composeBody}
                    onChange={(event) => setComposeBody(event.target.value)}
                    placeholder="Write a message…"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={
                      composing ||
                      !composeRecipientId ||
                      composeSubject.trim().length < 3 ||
                      !composeBody.trim()
                    }
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {composing ? "Sending…" : "Send"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setComposeOpen(false);
                      setComposeError("");
                    }}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  {composeError && (
                    <span className="text-xs" role="alert">{composeError}</span>
                  )}
                </div>
              </form>
            )}
          </section>
        )}
        {loading && <p className="mt-8 text-sm" role="status">Loading messages…</p>}
        {!loading && threads.length === 0 && !thread && (
          <p className="mt-8 text-sm">No conversations yet.</p>
        )}
        {!loading && (threads.length > 0 || Boolean(thread)) && (
          <div className="mt-8 grid gap-4 md:grid-cols-[300px_1fr]">
            <nav aria-label="Conversations" className="grid content-start gap-2">
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  to="/messages"
                  search={{thread:thread.id}}
                  aria-current={thread.id === selectedId?"page":undefined}
                  className={`rounded-xl border bg-card p-4 text-left ${
                    thread.id === selectedId ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{thread.subject}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(thread.lastMessageAt)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {thread.snippet || "No messages yet"}
                  </p>
                </Link>
              ))}
            </nav>
            <section className="rounded-xl border bg-card p-5" aria-label="Conversation">
              {loadingThread && <p className="text-sm" role="status">Loading conversation…</p>}
              {!loadingThread && !detail && error && <p role="alert" className="text-sm">{error}</p>}
              {!loadingThread && detail && (
                <>
                  <h2 className="text-lg font-semibold">{detail.thread.subject}</h2>
                  {detail.thread.contextHref&&<Link to={detail.thread.contextHref} href={detail.thread.contextHref} className="mt-2 inline-block text-sm underline">Open related assignment</Link>}
                  <div className="mt-4 grid max-h-[28rem] content-start gap-3 overflow-y-auto pr-1">
                    {detail.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[80%] rounded-xl border p-3 text-sm ${
                          message.own
                            ? "justify-self-end bg-primary text-primary-foreground"
                            : "justify-self-start bg-muted"
                        }`}
                      >
                        <p className={`text-xs ${message.own ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {message.own ? "You" : message.senderName} · {relativeTime(message.sentAt)}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      sendReply();
                    }}
                  >
                    <label className="block text-sm font-semibold">
                      Reply
                      <textarea
                        className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
                        rows={3}
                        maxLength={4000}
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Write a message…"
                      />
                    </label>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={sending || !reply.trim()}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                      {sentNotice && (
                        <span className="text-xs text-muted-foreground" role="status">
                          Message sent.
                        </span>
                      )}
                      {error && (
                        <span className="text-xs" role="alert">{error}</span>
                      )}
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
