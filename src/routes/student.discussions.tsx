import { WorkspaceShell, WorkspacePanel, EmptyState, StatusBadge, useUnsavedChangesGuard } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { DiscussionComposer } from "@/components/learning/DiscussionComposer";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getCourseDiscussions } from "@/modules/learning/course-discussions.functions";
import { postDiscussionMessage } from "@/modules/learning/discussion-post.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { z } from "zod";

const loadCourseDiscussions = () => getCourseDiscussions();
export const Route = createFileRoute("/student/discussions")({
  validateSearch: (search: Record<string, unknown>): { section?: string; lesson?: string; thread?: string } => ({
    section: typeof search.section === "string" ? search.section : undefined,
    lesson: typeof search.lesson === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(search.lesson) ? search.lesson : undefined,
    thread: typeof search.thread === "string" ? z.string().uuid().parse(search.thread) : undefined,
  }),
  loader: safeLoader(loadCourseDiscussions, { authMessage: "Sign in with an authorized student account to view course discussions." }),
  component: DiscussionsPage,
});

function DiscussionsPage() {
  const outcome = Route.useLoaderData();
  const { section, lesson, thread } = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="Course discussions" title="Course discussions" outcome={outcome} />;
  return <DiscussionsView threads={outcome.data.filter(item =>
    (!section || item.sectionId === section) && (!thread || item.id === thread) &&
    (!lesson || item.curriculumLessonId === lesson || item.curriculumLessonId === null))} />;
}

function DiscussionsView({ threads }: { threads: Awaited<ReturnType<typeof loadCourseDiscussions>> }) {
  const router = useRouter();
  const { section } = Route.useSearch();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | null>>({});
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  // A class discussion is not autosaved; never silently discard a typed reply.
  useUnsavedChangesGuard(Object.values(drafts).some(value => value.trim().length > 0) || mutation.pending);

  async function submit(threadId: string, body: string) {
    const parentMessageId = replyTo[threadId] ?? null;
    const outcome = await mutation.run(() => postDiscussionMessage({
      data: { threadId, body, parentMessageId },
    }), {
      successMessage: "Discussion response posted.",
      commandErrorMessage: "Unable to post discussion response.",
    });
    if (outcome.status === "saved" || outcome.status === "refresh-failed") {
      // Do not discard text or reply choices edited while the request was in flight.
      setDrafts(previous => previous[threadId] === body
        ? { ...previous, [threadId]: "" } : previous);
      setReplyTo(previous => previous[threadId] === parentMessageId
        ? { ...previous, [threadId]: null } : previous);
    }
  }

  return <WorkspaceShell width="standard" eyebrow="Course discussions" title="Course discussions"
    subtitle="Course prompts and replies from your actively enrolled classes and teaching team."
    breadcrumbs={<Link to="/classes" search={{ section }} className="text-sm underline">
      Back to {section ? "class" : "my classes"}
    </Link>}>
    <MutationFeedback state={mutation} className="mt-4" pendingMessage="Posting discussion response..." />
    <div className="mt-6 space-y-5">
      {threads.map(thread => <WorkspacePanel key={thread.id} title={thread.subject}
        description={`${thread.messages.length} messages`}>
        {thread.locked && <StatusBadge tone="attention">Discussion locked</StatusBadge>}
        <div className="mt-4 space-y-3">
          {thread.messages.map(message => <article key={message.id}
            className={`border border-border bg-background p-3 text-sm ${message.parentMessageId ? "ml-4" : ""}`}>
            <p className="text-xs font-semibold">{message.authorLabel} · {new Date(message.createdAt).toLocaleDateString()}</p>
            <p className="mt-2 whitespace-pre-wrap break-words">{message.body}</p>
            {!thread.locked && !message.hidden && <Button type="button" variant="ghost" size="sm"
              disabled={busy} className="mt-2" onClick={() => setReplyTo(previous =>
                ({ ...previous, [thread.id]: message.id }))}>Reply</Button>}
          </article>)}
          {thread.messages.length === 0 && <EmptyState title="No discussion messages yet." />}
        </div>
        {!thread.locked && <div className="mt-5 border-t border-border pt-4">
          <DiscussionComposer value={drafts[thread.id] ?? ""}
            onChange={value => setDrafts(previous => ({ ...previous, [thread.id]: value }))}
            onSubmit={value => submit(thread.id, value)}
            label={replyTo[thread.id] ? "Reply to message" : "New post"}
            placeholder="Write a discussion response" maxLength={5000}
            submitLabel="Post response" pending={mutation.pending} disabled={busy}>
            {replyTo[thread.id] && <Button type="button" size="sm" variant="ghost"
              onClick={() => setReplyTo(previous => ({ ...previous, [thread.id]: null }))}
              disabled={busy}>Cancel reply</Button>}
          </DiscussionComposer>
        </div>}
      </WorkspacePanel>)}
      {!threads.length && <EmptyState title="No class discussions yet"
        description="No discussions have been posted for your classes yet." />}
    </div>
  </WorkspaceShell>;
}
