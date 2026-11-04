import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, MessageSquare, Search, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CreateAction, MasterDetailWorkspace, PersonMark, QueryState } from "@/components/workspace";
import type { getThread, listMyThreads } from "@/modules/communication/messages.functions";

type ThreadSummary = Awaited<ReturnType<typeof listMyThreads>>["threads"][number];
type ThreadDetail = Awaited<ReturnType<typeof getThread>>;

export function MessagesWorkspace({ threads, selectedId, detail, loading, loadingThread, error,
  onRetry, onSelect, reply, onReplyChange, onSend, busy, feedback, onCompose }: {
  threads: ThreadSummary[];
  selectedId: string;
  detail: ThreadDetail | null;
  loading: boolean;
  loadingThread: boolean;
  error: string;
  onRetry: () => void;
  onSelect: (id: string) => void;
  reply: string;
  onReplyChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  feedback: ReactNode;
  onCompose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mobileListFor, setMobileListFor] = useState<string | null>(null);
  const visible = threads.filter(thread =>
    `${thread.subject} ${thread.snippet}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const currentDetail = detail?.thread.id === selectedId ? detail : null;
  return <MasterDetailWorkspace title="Conversations"
    description="Stay connected with your school community."
    toolbar={<CreateAction><button type="button" disabled={busy} onClick={onCompose}>New message</button></CreateAction>}
    className="mt-6"
    mobileMode={selectedId && mobileListFor !== selectedId ? "detail" : "list"}
    list={<>
      <div className="border-b p-4">
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input aria-label="Search conversations" placeholder="Search conversations..." value={query}
            onChange={event => setQuery(event.target.value)} className="pl-9" />
        </label>
        <p className="mt-3 text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "conversation" : "conversations"}</p>
      </div>
      <QueryState loading={loading ? "Loading messages..." : undefined}
        isEmpty={!visible.length} empty={<p role="status" className="p-5 text-sm text-muted-foreground">
          {query ? "No conversations match your search." : "No conversations yet. Start a new message to connect."}
        </p>}>
        <nav aria-label="Conversations" className="max-h-[36rem] overflow-y-auto">
          {visible.map(thread => <button key={thread.id} type="button" aria-current={thread.id === selectedId ? "true" : undefined}
            disabled={busy} onClick={() => { onSelect(thread.id); setMobileListFor(null); }}
            className={`block w-full min-w-0 border-b border-l-2 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${
              thread.id === selectedId ? "border-l-primary bg-accent/60" : "border-l-transparent"
            }`}>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center border bg-muted text-muted-foreground"><MessageSquare aria-hidden="true" className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{thread.subject}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{thread.snippet || "No messages yet"}</p>
                <time dateTime={thread.lastMessageAt} className="mt-3 block text-xs text-muted-foreground">
                  {new Date(thread.lastMessageAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </time>
              </div>
            </div>
          </button>)}
        </nav>
      </QueryState>
    </>}
    detail={<section aria-label="Conversation" className="flex min-h-96 min-w-0 flex-col">
      <div className="border-b px-5 py-4 lg:hidden">
        <Button variant="ghost" size="sm" onClick={() => setMobileListFor(selectedId)}><ArrowLeft aria-hidden="true" />All conversations</Button>
      </div>
      <QueryState loading={loadingThread ? "Loading conversation..." : undefined}
        error={error || undefined} onRetry={onRetry}>
        {currentDetail ? <>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b p-5">
            <div className="min-w-0">
              <h3 className="break-words font-serif text-section">{currentDetail.thread.subject}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Private conversation with verified participants</p>
            </div>
            {currentDetail.thread.contextHref && <a href={currentDetail.thread.contextHref}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline focus-visible:ring-2 focus-visible:ring-ring">
              Open related assignment<ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>}
          </header>
          <ol aria-label="Message history" className="grid max-h-[32rem] min-h-64 content-start gap-6 overflow-y-auto p-5">
            {currentDetail.messages.map(message => <li key={message.id}
              className={`flex min-w-0 gap-3 ${message.own ? "flex-row-reverse" : ""}`}>
              <PersonMark name={message.own ? "You" : message.senderName} />
              <div className="min-w-0 max-w-[85%]">
                <div className={`mb-2 flex flex-wrap items-baseline gap-2 ${message.own ? "justify-end" : ""}`}>
                  <span className="text-xs font-semibold">{message.own ? "You" : message.senderName}</span>
                  <time dateTime={message.sentAt} className="text-xs text-muted-foreground">
                    {new Date(message.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </time>
                </div>
                <p className={`whitespace-pre-wrap break-words border p-4 text-sm leading-relaxed ${message.own ? "border-primary/20 bg-accent" : "bg-muted/40"}`}>{message.body}</p>
              </div>
            </li>)}
          </ol>
          <form className="mt-auto border-t p-5" aria-busy={busy} onSubmit={event => { event.preventDefault(); onSend(); }}>
            <label htmlFor="message-reply" className="text-xs font-semibold">Reply to this conversation</label>
            <Textarea id="message-reply" className="mt-2" rows={3} maxLength={4000} required disabled={busy}
              value={reply} onChange={event => onReplyChange(event.target.value)} placeholder="Write a thoughtful reply..." />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4" />Only conversation participants can view messages.</p>
              <Button type="submit" disabled={busy || !reply.trim()}><Send aria-hidden="true" />{busy ? "Please wait..." : "Send reply"}</Button>
            </div>
          </form>
        </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
          <MessageSquare aria-hidden="true" className="size-8" />
          <p className="text-sm">Select a conversation or start a new message.</p>
        </div>}
      </QueryState>
      <div className="px-5 pb-4">{feedback}</div>
    </section>}
    footer="Contacts and conversations follow your verified school relationships. Confidential support and safety concerns belong in their dedicated workflows."
  />;
}
