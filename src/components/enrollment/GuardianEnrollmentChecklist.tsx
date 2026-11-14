import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { EvidenceDocumentLink } from "@/components/evidence/EvidenceDocumentLink";
import { createEnrollmentDocumentUploads, enrollmentDocumentUploadAvailabilityQuery } from "./enrollment-document-upload";
import { QueryState } from "@/components/workspace/query-state";
import { useRouter } from "@tanstack/react-router";
import { getGuardianEnrollmentChecklist } from "@/modules/enrollment/guardian-enrollment-checklist.functions";
import { getEnrollmentDocumentDownload } from "@/modules/enrollment/r2-document-upload.functions";
import { GuardianEnrollmentForm } from "./EnrollmentForm";
import { LaunchUnsavedChangesGuard } from "@/components/launch-studio/useLaunchUnsavedChanges";

type Checklist = Awaited<ReturnType<typeof getGuardianEnrollmentChecklist>>;

export function GuardianEnrollmentChecklist({ applicationId, protectUnsaved = false }: { applicationId: string; protectUnsaved?: boolean }) {
  return <GuardianEnrollmentChecklistView key={applicationId} applicationId={applicationId} protectUnsaved={protectUnsaved}/>;
}

function GuardianEnrollmentChecklistView({ applicationId, protectUnsaved }: { applicationId: string; protectUnsaved: boolean }) {
  const router = useRouter();
  const checklistQuery = useQuery({
    queryKey: ["guardian-enrollment-checklist", applicationId],
    queryFn: () => getGuardianEnrollmentChecklist({ data: { applicationId } }),
    retry: false,
    gcTime: 0,
  });
  // Storage availability is independent so an outage cannot block forms.
  const availabilityQuery = useQuery(enrollmentDocumentUploadAvailabilityQuery());
  const data = checklistQuery.data;
  const availability = availabilityQuery.data;
  const [error, setError] = useState("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [dirtyForms, setDirtyForms] = useState<Record<string, boolean>>({});
  const [uploads] = useState(createEnrollmentDocumentUploads);
  async function refresh() {
    await checklistQuery.refetch({ throwOnError: true });
    await router.invalidate();
  }
  const mutation = useMutationFeedback(refresh);
  const busy = mutation.pending || mutation.refreshFailed || checklistQuery.isFetching ? "upload" : null;

  async function upload(requirementId: string) {
    const file = files[requirementId];
    if (!file) { setError("Choose a PDF, JPEG or PNG file first."); return; }
    setError("");
    await mutation.run(async () => {
      await uploads.upload(applicationId, requirementId, file);
      setFiles(current => ({ ...current, [requirementId]: null }));
    }, {
      successMessage: "Document received. Admissions must review it before this requirement is complete.",
      commandErrorMessage: "Unable to upload enrollment document. Retry to finish without uploading again.",
    });
  }
  async function openDocument(requirementId: string, documentId: string) {
    const { downloadUrl } = await getEnrollmentDocumentDownload({ data: { applicationId, requirementId, documentId } });
    return downloadUrl;
  }
  return <section aria-label="Family enrollment checklist" className="mt-4 space-y-3 rounded-lg border p-4">
    {protectUnsaved && <LaunchUnsavedChangesGuard dirty={Object.values(files).some(Boolean) ||
      Object.values(dirtyForms).some(Boolean) || mutation.pending || mutation.refreshFailed}
      message="Leave enrollment? Unsaved form answers or selected documents will be lost. Stay to save or submit them, or leave without saving." />}
    <h3 className="text-lg font-semibold">Enrollment checklist</h3>
    <p className="text-sm">Complete the school's requested information here. Uploading a document does not accept an offer,
      sign a form or activate enrollment.</p>
    {error && <p role="alert">{error}</p>}
    <MutationFeedback state={mutation} pendingMessage="Uploading enrollment document..."/>
    <QueryState loading={checklistQuery.isPending ? "Loading enrollment checklist..." : undefined}
      error={checklistQuery.isError ? mutationErrorMessage(checklistQuery.error, "Unable to load enrollment checklist") : undefined}
      onRetry={() => void checklistQuery.refetch()} retrying={checklistQuery.isFetching || busy !== null}>
    {data && <EnrollmentChecklistItems checklist={data}
      uploadsEnabled={availability && !availabilityQuery.isError
        ? data.synthetic ? availability.demo : availability.live
        : false}
      uploadsAvailabilityPending={availabilityQuery.isPending}
      uploadsAvailabilityError={availabilityQuery.isError}
      busy={busy} files={files} onFile={(id, file) => setFiles(current => ({ ...current, [id]: file }))}
      onUpload={upload} onOpen={openDocument} onChanged={refresh}
      onFormDirtyChange={(id,dirty)=>setDirtyForms(current=>current[id]===dirty?current:{...current,[id]:dirty})} />}
    </QueryState>
  </section>;
}

export function EnrollmentChecklistItems({ checklist, uploadsEnabled, uploadsAvailabilityPending = false,
  uploadsAvailabilityError = false, busy, files, onFile, onUpload, onOpen, onChanged, onFormDirtyChange }: {
  checklist: Checklist; uploadsEnabled: boolean; uploadsAvailabilityPending?: boolean;
  uploadsAvailabilityError?: boolean; busy: string | null; files: Record<string, File | null>;
  onFile: (requirementId: string, file: File | null) => void;
  onUpload: (requirementId: string) => Promise<void>;
  onOpen: (requirementId: string, documentId: string) => Promise<string>;
  onChanged: () => Promise<void>;
  onFormDirtyChange?: (id: string, dirty: boolean) => void;
}) {
  return <div className="space-y-3">
    {checklist.closed && <p role="status">This checklist is now a historical record. Contact admissions for further changes.</p>}
    {!checklist.closed && uploadsAvailabilityPending && checklist.requirements.some(requirement =>
      !requirement.form && requirement.status !== "complete") && <p role="status">Checking secure document upload availability.</p>}
    {!checklist.closed && uploadsAvailabilityError && <p role="status">Secure document upload availability could not be confirmed.
      You can still complete forms; contact admissions to submit documents.</p>}
    {!checklist.closed && !uploadsEnabled && !uploadsAvailabilityPending && !uploadsAvailabilityError && <p role="status">Online document uploads are not enabled for this application.
      Contact admissions to arrange submission. You can still view recorded document reviews.</p>}
    {checklist.requirements.map(requirement => <article key={requirement.id} className="space-y-2 rounded border p-3">
      <h4 className="font-semibold">{requirement.title}{requirement.blocking ? " (required)" : " (optional)"}</h4>
      {requirement.form && <GuardianEnrollmentForm key={requirement.form.submission?.id ?? requirement.form.revision}
        applicationId={checklist.applicationId} requirementId={requirement.id} record={requirement.form}
        closed={checklist.closed} onChanged={onChanged}
        onDirtyChange={onFormDirtyChange ? dirty=>onFormDirtyChange(requirement.id,dirty) : undefined} />}
      <p className="text-sm">Requirement: {requirement.status.replaceAll("_", " ")}
        {requirement.reviewStatus && ` · Document: ${requirement.reviewStatus.replaceAll("_", " ")}`}</p>
      {requirement.correctionReason && <p className="text-sm">Admissions instructions: {requirement.correctionReason}</p>}
      {requirement.reviewStatus === "received" && <p className="text-sm">Received - awaiting admissions review.</p>}
      <ul className="space-y-1 text-sm">{requirement.documents.map(document => <li key={document.id}>
        {document.fileName} · {document.current ? document.reviewStatus : "superseded"}
        {document.canDownload && <EvidenceDocumentLink label="Open document" disabled={busy !== null}
          onGetDownloadUrl={() => onOpen(requirement.id, document.id)}/>}
      </li>)}</ul>
      {!requirement.form && !checklist.closed && uploadsEnabled && requirement.status !== "complete" && <fieldset disabled={busy !== null}>
        <label className="block text-sm">Supporting document (PDF, JPEG or PNG, up to 10 MB)
          <input key={requirement.documents.filter(document => document.current).map(document => document.id).join(":")}
            type="file" accept="application/pdf,image/jpeg,image/png" className="mt-2 block w-full"
            onChange={event => onFile(requirement.id, event.target.files?.[0] ?? null)} />
        </label>
        <button type="button" disabled={!files[requirement.id]} className="mt-2 rounded border px-3 py-2 text-sm"
          onClick={() => void onUpload(requirement.id)}>{requirement.documents.length ? "Submit replacement document" : "Submit document"}</button>
      </fieldset>}
    </article>)}
    {!checklist.requirements.length && <p>No checklist requirements have been configured. Contact admissions for next steps.</p>}
  </div>;
}
