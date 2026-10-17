import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  confirmAskCanAction,
  sendAskCanMessage,
} from "@/modules/conversation/ask-can.functions";
import { WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/ask")({ component: AskCanPage });

type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  body: string;
  evidenceRefs: { type: string; id: string; label: string }[];
  actionPreview: {
    runId: string;
    tool: string;
    summary: string;
    args: Record<string, unknown>;
  } | null;
};

function AskCanPage() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    const body = input.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", body, evidenceRefs: [], actionPreview: null },
    ]);
    try {
      const turn = await sendAskCanMessage({
        data: { conversationId, body },
      });
      setConversationId(turn.conversationId);
      setMessages((prev) => [...prev, turn.message as ChatMessage]);
    } catch {
      setError("Sign in with an authorized account to talk to CAN.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(runId: string, approve: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const turn = await confirmAskCanAction({ data: { runId, approve } });
      setMessages((prev) => [
        // The approval card is resolved once decided.
        ...prev.map((message) =>
          message.actionPreview?.runId === runId
            ? { ...message, actionPreview: null }
            : message,
        ),
        turn.message as ChatMessage,
      ]);
    } catch {
      setError("That action could not be completed. It may already be decided.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Ask CAN"
      title="Ask CAN"
      subtitle="Answers and actions use your permissions. Anything that changes something asks for your confirmation first."
    >
      {error && (
        <p className="mt-6 rounded-lg border border-amber-500 p-3 text-sm text-amber-600">
          {error}
        </p>
      )}

      <section aria-label="Conversation" className="mt-8 grid gap-4">
        {messages.length === 0 && (
          <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            <p>Try:</p>
            <ul className="mt-2 list-disc pl-5">
              <li>“How is my child doing?”</li>
              <li>“Tell me when my child misses an assignment.”</li>
              <li>“What are you watching for me?”</li>
            </ul>
          </div>
        )}

        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-2xl rounded-xl border p-4 whitespace-pre-line ${
              message.role === "user"
                ? "justify-self-end bg-muted"
                : "justify-self-start bg-card"
            }`}
          >
            <p className="text-sm">{message.body}</p>

            {message.evidenceRefs.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {message.evidenceRefs.map((ref) => (
                  <span
                    key={`${ref.type}-${ref.id}`}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {ref.label}
                  </span>
                ))}
              </div>
            )}

            {message.actionPreview && (
              <div className="mt-3 rounded-lg border p-3">
                <p className="text-sm font-semibold">{message.actionPreview.summary}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(message.actionPreview!.runId, true)}
                    className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decide(message.actionPreview!.runId, false)}
                    className="rounded-full border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </section>

      <form
        className="mt-8 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask CAN anything…"
          aria-label="Message CAN"
          className="flex-1 rounded-full border bg-card px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Manage your standing instructions under{" "}
        <Link to="/guardian/watching" className="underline">
          Things CAN Is Watching
        </Link>
        .
      </p>
    </WorkspaceShell>
  );
}
