import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell, MutationFeedback } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { getProviderContentWorkspace } from "@/modules/learning/provider-content-workspace.functions";
import { createRecordedInstructionDraft } from "@/modules/learning/instructional-tracks.functions";

export const Route = createFileRoute("/canonical/content")({
  loader: () => safeLoader(() => getProviderContentWorkspace())(),
  component: ContentCreatorHome,
});

function ContentCreatorHome() {
  const outcome = Route.useLoaderData();
  const router = useRouter();
  const [courseVersionId, setCourseVersionId] = useState("");
  const [title, setTitle] = useState("");
  const [trackKind, setTrackKind] = useState<"primary" | "supplemental">("primary");
  const pendingRequestId = useRef<string | null>(null);
  const mutation = useMutationFeedback(() => router.invalidate());

  if (!outcome.ok) return <LoaderFailure eyebrow="Content production" title="My instructional content" outcome={outcome} />;
  if (outcome.data.role !== "academic_content_creator") return <WorkspaceShell title="Creator access required">
    <p role="alert">Switch to a verified academic content creator membership. This page never grants additional content authority.</p>
  </WorkspaceShell>;
  const { courses, tracks, assignmentsLimited } = outcome.data;
  const versions = courses.flatMap(course => course.publishedVersions.map(version => ({
    id: version.id, label: `${course.code} · ${course.title} · Course v${version.versionNo}`,
  })));
  async function create(event: FormEvent) {
    event.preventDefault();
    if (mutation.pending || !versions.some(version => version.id === courseVersionId) || !title.trim()) return;
    const requestId = pendingRequestId.current ?? crypto.randomUUID();
    pendingRequestId.current = requestId;
    const result = await mutation.run(() => createRecordedInstructionDraft({
      data: { requestId, courseVersionId, title: title.trim(), trackKind },
    }), {
      successMessage: "Private instructional track draft created.",
      commandErrorMessage: "Could not create this instructional track. Check your current course appointment.",
      refreshErrorMessage: "Draft created, but the queue could not be refreshed. Refresh before creating another.",
    });
    if (result.status === "saved" || result.status === "refresh-failed") {
      pendingRequestId.current = null;
      setTitle(""); setCourseVersionId(""); setTrackKind("primary");
    }
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Content production"
    title="My instructional content"
    subtitle="Build recorded teacher tracks for your assigned published Courses. Your organization-wide role alone does not grant a Course appointment. All drafts stay private until independent review and publication.">
    {assignmentsLimited && <p role="alert" className="mt-5 border border-warning p-4 text-sm">The provider inventory reached its safety limit. Ask the academic administrator to narrow or review appointments before relying on this queue.</p>}
    <section className="mt-6 border border-border bg-card p-5" aria-labelledby="create-track-title">
      <h2 id="create-track-title" className="font-serif text-2xl">Start a recorded teacher track</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only published Course versions under your current independently verified appointment appear here.</p>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event => void create(event)}>
        <Field label="Published Course version" required className="sm:col-span-2">
          <Select value={courseVersionId} onChange={event => {pendingRequestId.current=null;setCourseVersionId(event.target.value);}} required>
            <option value="">Choose an assigned Course</option>
            {versions.map(version => <option key={version.id} value={version.id}>{version.label}</option>)}
          </Select>
        </Field>
        <Field label="Track name" required>
          <Input required minLength={1} maxLength={250} value={title} onChange={event=>{pendingRequestId.current=null;setTitle(event.target.value);}} placeholder="Algebra I · recorded instruction"/>
        </Field>
        <Field label="Track type">
          <Select value={trackKind} onChange={event=>{pendingRequestId.current=null;setTrackKind(event.target.value as "primary"|"supplemental");}}>
            <option value="primary">Primary instruction</option>
            <option value="supplemental">Supplemental practice</option>
          </Select>
        </Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={mutation.pending || mutation.refreshFailed || !courseVersionId || !title.trim()}>
          {mutation.pending ? "Creating…" : "Create private draft"}
        </Button></div>
      </form>
      <MutationFeedback state={mutation} className="mt-4" pendingMessage="Creating content draft…"/>
      {!versions.length && <p role="status" className="mt-4 text-sm">No published Course versions are assigned to your currently verified provider appointment.</p>}
    </section>
    <section className="mt-7" aria-label="My instructional track versions">
      <h2 className="font-serif text-2xl">My tracks</h2>
      {!tracks.length && <p className="mt-3 border border-border bg-card p-5 text-sm">No instructional tracks created under your current appointments.</p>}
      <div className="mt-4 grid gap-3">
        {tracks.map(track => {
          const course = courses.find(item => item.id === track.courseId);
          const canEdit = track.lifecycle === "draft" && !track.submissionManifestHash;
          return <article key={track.id} className="border border-border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div><h3 className="font-semibold">{track.title} · v{track.versionNo}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{course?.title ?? "Assigned Course"} · {track.trackKind} · {track.lifecycle}</p>
              </div>
              <span className="border border-border px-3 py-1 text-xs">
                {track.lifecycle === "published" ? "Published" : track.submissionManifestHash ? "Submitted for review" : "Draft"}
              </span>
            </div>
            {canEdit ? <Link to="/canonical/content/$trackVersionId" params={{trackVersionId:track.id}}
              className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary underline">Edit lessons and submit for review</Link>
              : <p className="mt-3 text-sm text-muted-foreground">
                {track.lifecycle==="published"
                  ? "This version is published and cannot be edited in place."
                  : "The submitted manifest is locked while independent review proceeds."}
              </p>}
          </article>;
        })}
      </div>
    </section>
  </WorkspaceShell>;
}
