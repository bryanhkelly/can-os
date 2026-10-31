import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { getGuardianEnrollmentChecklist } from "@/modules/enrollment/guardian-enrollment-checklist.functions";
import { beginEnrollmentDocumentUpload, finishEnrollmentDocumentUpload, getEnrollmentDocumentDownload,
  getEnrollmentDocumentUploadAvailability } from "@/modules/enrollment/r2-document-upload.functions";
import { GuardianEnrollmentForm } from "./EnrollmentForm";

type Checklist = Awaited<ReturnType<typeof getGuardianEnrollmentChecklist>>;
type Availability = Awaited<ReturnType<typeof getEnrollmentDocumentUploadAvailability>>;

export function GuardianEnrollmentChecklist({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ checklist: Checklist; availability: Availability } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [notice, setNotice] = useState("");
  const pending = useRef(new Map<string, { file: File; key: string }>());
  useEffect(() => {
    let current = true;
    setData(null); setError("");
    void Promise.all([
      getGuardianEnrollmentChecklist({ data: { applicationId } }),
      // A storage outage must not block consent forms or the enrollment checklist.
      getEnrollmentDocumentUploadAvailability().catch(() => ({ live: false, demo: false })),
    ]).then(([checklist, availability]) => {
      if (current) setData({ checklist, availability });
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : "Unable to load enrollment checklist");
    });
    return () => { current = false; };
  }, [applicationId, attempt]);

  async function upload(requirementId: string) {
    const file = files[requirementId];
    if (!file) { setError("Choose a PDF, JPEG or PNG file first."); return; }
    setBusy(requirementId); setError(""); setNotice("");
    try {
      const request = { applicationId, requirementId, fileName: file.name, mimeType: file.type, size: file.size };
      const previous = pending.current.get(requirementId);
      let key = previous?.file === file ? previous.key : undefined;
      if (!key) {
        const upload = await beginEnrollmentDocumentUpload({ data: request });
        const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error(`Document upload failed (${response.status}). Please retry.`);
        key = upload.key;
        pending.current.set(requirementId, { file, key });
      }
      await finishEnrollmentDocumentUpload({ data: { ...request, key } });
      pending.current.delete(requirementId);
      setFiles(current => ({ ...current, [requirementId]: null }));
      setNotice("Document received. Admissions must review it before this requirement is complete.");
      setAttempt(value => value + 1);
      await router.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to upload enrollment document"); }
    finally { setBusy(null); }
  }
  async function openDocument(requirementId: string, documentId: string) {
    setBusy(requirementId); setError("");
    try {
      const { downloadUrl } = await getEnrollmentDocumentDownload({ data: { applicationId, requirementId, documentId } });
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open enrollment document"); }
    finally { setBusy(null); }
  }
  return <section aria-label="Family enrollment checklist" className="mt-4 space-y-3 rounded-lg border p-4">
    <h3 className="text-lg font-semibold">Enrollment checklist</h3>
    <p className="text-sm">Complete the school's requested information here. Uploading a document does not accept an offer,
      sign a form or activate enrollment.</p>
    {error && <div role="alert"><p>{error}</p>{!data && <button type="button" className="underline"
      onClick={() => setAttempt(value => value + 1)}>Retry checklist</button>}</div>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Loading enrollment checklist...</p>}
    {data && <EnrollmentChecklistItems checklist={data.checklist}
      uploadsEnabled={data.checklist.synthetic ? data.availability.demo : data.availability.live}
      busy={busy} files={files} onFile={(id, file) => setFiles(current => ({ ...current, [id]: file }))}
      onUpload={upload} onOpen={openDocument} onChanged={async () => {
        setAttempt(value => value + 1); await router.invalidate();
      }} />}
  </section>;
}

export function EnrollmentChecklistItems({ checklist, uploadsEnabled, busy, files, onFile, onUpload, onOpen, onChanged }: {
  checklist: Checklist; uploadsEnabled: boolean; busy: string | null; files: Record<string, File | null>;
  onFile: (requirementId: string, file: File | null) => void;
  onUpload: (requirementId: string) => Promise<void>;
  onOpen: (requirementId: string, documentId: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  return <div className="space-y-3">
    {checklist.closed && <p role="status">This checklist is now a historical record. Contact admissions for further changes.</p>}
    {!checklist.closed && !uploadsEnabled && <p role="status">Online document uploads are not enabled for this application.
      Contact admissions to arrange submission. You can still view recorded document reviews.</p>}
    {checklist.requirements.map(requirement => <article key={requirement.id} className="space-y-2 rounded border p-3">
      <h4 className="font-semibold">{requirement.title}{requirement.blocking ? " (required)" : " (optional)"}</h4>
      {requirement.form && <GuardianEnrollmentForm key={requirement.form.submission?.id ?? requirement.form.revision}
        applicationId={checklist.applicationId} requirementId={requirement.id} record={requirement.form}
        closed={checklist.closed} onChanged={onChanged} />}
      <p className="text-sm">Requirement: {requirement.status.replaceAll("_", " ")}
        {requirement.reviewStatus && ` · Document: ${requirement.reviewStatus.replaceAll("_", " ")}`}</p>
      {requirement.correctionReason && <p className="text-sm">Admissions instructions: {requirement.correctionReason}</p>}
      {requirement.reviewStatus === "received" && <p className="text-sm">Received - awaiting admissions review.</p>}
      <ul className="space-y-1 text-sm">{requirement.documents.map(document => <li key={document.id}>
        {document.fileName} · {document.current ? document.reviewStatus : "superseded"}
        {document.canDownload && <button type="button" disabled={busy !== null} className="ml-3 underline"
          onClick={() => void onOpen(requirement.id, document.id)}>Open document</button>}
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
