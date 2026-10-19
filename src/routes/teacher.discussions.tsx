import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getTeacherCourseDiscussions } from "@/modules/learning/discussion-teacher-query.functions";
import { createCourseDiscussion, setCourseDiscussionLock, moderateDiscussionMessage } from "@/modules/learning/discussion-teacher.functions";
import { postDiscussionMessage } from "@/modules/learning/discussion-post.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, WorkspacePanel, StatusBadge } from "@/components/workspace";

export const Route = createFileRoute("/teacher/discussions")({
  validateSearch: (search: Record<string, unknown>): { section?: string } => ({
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  loader: safeLoader(() => getTeacherCourseDiscussions(), { authMessage: "Sign in with an authorized teacher account to manage class discussions." }),
  component: TeacherDiscussions,
});
function TeacherDiscussions() {
  const outcome = Route.useLoaderData();
  const {section}=Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Teacher" title="Class discussions" outcome={outcome}/>;
  return <TeacherDiscussionsView key={section ?? "all"} data={outcome.data}/>;
}
export function TeacherDiscussionsView({ data }: { data: Awaited<ReturnType<typeof getTeacherCourseDiscussions>> }) {
  const { section } = Route.useSearch();
  const router = useRouter();
  const sections = data.sections.filter(item => !section || item.id === section);
  const threads = data.threads.filter(item => !section || item.sectionId === section);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(command: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await command(); await router.invalidate(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update class discussion."); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Teacher" title="Class discussions"
    subtitle="Discuss classwork with enrolled students. The assigned teaching team can respond, lock discussions and moderate posts."
    breadcrumbs={<Link to="/classes" search={{ section }} className="underline">Back to classes</Link>}>
    {error && <p role="alert" className="mt-5 rounded-lg border p-3 text-sm">{error}</p>}
    {section && !sections.length && <p role="alert" className="mt-5 rounded-lg border p-4 text-sm">This class is unavailable in your current teaching membership.</p>}
    {sections.length > 0 && <details className="mt-6 rounded-xl border bg-card p-5">
      <summary className="cursor-pointer font-semibold">Start a class discussion</summary>
      <form className="mt-4 grid gap-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => { await createCourseDiscussion({ data: { sectionId, subject, prompt } }); setSubject(""); setPrompt(""); });
      }}>
        <label className="text-sm">Class<select value={sectionId} disabled={busy} onChange={event => setSectionId(event.target.value)} className="mt-2 block w-full rounded-lg border bg-background p-3">
          {sections.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label className="text-sm">Title<input value={subject} disabled={busy} maxLength={160} onChange={event => setSubject(event.target.value)} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
        <label className="text-sm">Prompt<textarea value={prompt} disabled={busy} maxLength={5000} rows={4} onChange={event => setPrompt(event.target.value)} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
        <button disabled={busy || !sectionId || subject.trim().length < 3 || prompt.trim().length < 3} className="justify-self-start rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">Post discussion</button>
      </form>
    </details>}
    <div className="mt-7 grid gap-5">{threads.map(thread => <WorkspacePanel key={thread.id} title={thread.subject}
      description={data.sections.find(item => item.id === thread.sectionId)?.title}
      actions={<StatusBadge tone={thread.locked ? "attention" : "neutral"}>{thread.locked ? "Locked" : "Open"}</StatusBadge>}>
      <button type="button" disabled={busy} onClick={() => void run(() => setCourseDiscussionLock({ data: { threadId: thread.id, locked: !thread.locked } }))}
        className="text-sm underline disabled:opacity-50">{thread.locked ? "Unlock discussion" : "Lock discussion"}</button>
      <div className="mt-4 grid gap-3">{thread.messages.map(message => <article key={message.id} className={"rounded-lg border p-4 text-sm " + (message.parentMessageId ? "ml-4" : "")}>
        <p className="text-xs text-muted-foreground">{message.authorLabel} · {new Date(message.createdAt).toLocaleString()}</p>
        <p className="mt-2 whitespace-pre-wrap">{message.body}</p>
        {message.canModerate && <button type="button" disabled={busy} onClick={() => void run(() => moderateDiscussionMessage({ data: { messageId: message.id, hidden: !message.hidden } }))}
          className="mt-3 text-xs underline disabled:opacity-50">{message.hidden ? "Restore post" : "Hide post"}</button>}
      </article>)}</div>
      {!thread.locked && <form className="mt-4 grid gap-3" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          await postDiscussionMessage({ data: { threadId: thread.id, body: drafts[thread.id] ?? "", parentMessageId: null } });
          setDrafts(previous => ({ ...previous, [thread.id]: "" }));
        });
      }}>
        <label className="text-sm">Teacher response<textarea disabled={busy} maxLength={5000} rows={3} value={drafts[thread.id] ?? ""}
          onChange={event => setDrafts(previous => ({ ...previous, [thread.id]: event.target.value }))} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
        <button disabled={busy || !drafts[thread.id]?.trim()} className="justify-self-start rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Post response</button>
      </form>}
    </WorkspacePanel>)}</div>
    {!threads.length && <p role="status" className="mt-5 rounded-xl border p-5 text-sm text-muted-foreground">No class discussions yet.</p>}
  </WorkspaceShell>;
}
