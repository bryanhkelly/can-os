import { useCallback, useEffect, useRef, useState } from "react";
import {
  createAssessmentResourceUpload,
  finalizeAssessmentResource,
  listAssessmentResources,
  getAssessmentResourceDownload,
  removeAssessmentResource,
} from "@/modules/learning/assessment-resources.functions";
import { attachmentAccept, attachmentMimeForFileName } from "@/modules/learning/attachment-mimes";
import { createPrivateUploadTask, documentUploadPolicy } from "@/platform/storage/private-upload";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { WorkspacePanel, WorkspaceNotice } from "@/components/workspace";
import { Button } from "@/components/ui/button";

type Resource = { documentId: string; fileName: string; mimeType: string | null };

/** Teacher management of the published resource files on one assignment. */
export function AssessmentResourcesManager({ assessmentId, assessmentTitle }: {
  assessmentId: string; assessmentTitle: string;
}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const result = await listAssessmentResources({ data: { assessmentId } });
    setResources(result.resources);
  }, [assessmentId]);
  useEffect(() => {
    refresh().catch(() => setError("Unable to load assignment resources."));
  }, [refresh]);
  async function upload() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length) { setError("Choose a file to attach first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      for (const file of files) {
        const contentType = attachmentMimeForFileName(file.name);
        if (!contentType) throw new Error("Unsupported file type or size: " + file.name);
        const task = createPrivateUploadTask({
          file, contentType, policy: documentUploadPolicy,
          begin: () => createAssessmentResourceUpload({ data: {
            assessmentId, fileName: file.name, contentType, sizeBytes: file.size,
          } }),
          finish: uploadResult => finalizeAssessmentResource({ data: { assessmentId, documentId: uploadResult.documentId } }),
        });
        await task.run();
      }
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
      setNotice("Resources published to this class.");
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to attach the resource"));
    } finally { setBusy(false); }
  }
  async function remove(documentId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await removeAssessmentResource({ data: { assessmentId, documentId } });
      await refresh();
      setNotice("Resource removed.");
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to remove the resource"));
    } finally { setBusy(false); }
  }
  return <WorkspacePanel className="mt-6" title={`Assignment resources · ${assessmentTitle}`}
    description="Worksheets, guides and exemplars students see on this assignment's page. PDF, PNG or JPEG, maximum 10 MB each.">
    {resources.length === 0 && <p className="text-sm text-muted-foreground">No resources attached yet.</p>}
    {resources.length > 0 && <ul className="divide-y divide-border/60">
      {resources.map(resource => <li key={resource.documentId} className="flex items-center justify-between gap-3 py-3 text-sm">
        <span className="min-w-0 font-semibold break-words">{resource.fileName}</span>
        <span className="flex shrink-0 gap-3">
          <button type="button" className="text-sm font-semibold text-primary underline" disabled={busy}
            onClick={async () => {
              try {
                const download = await getAssessmentResourceDownload({ data: { assessmentId, documentId: resource.documentId } });
                window.location.assign(download.downloadUrl);
              } catch (cause) { setError(mutationErrorMessage(cause, "Unable to open this resource")); }
            }}>View</button>
          <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={() => void remove(resource.documentId)}>Remove</Button>
        </span>
      </li>)}
    </ul>}
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold">Attach resource files
        <input ref={fileRef} type="file" multiple accept={attachmentAccept} disabled={busy}
          className="mt-2 block w-full rounded-lg border p-2 text-xs" />
      </label>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void upload()}>
        {busy ? "Working..." : "Publish to class"}
      </Button>
    </div>
    {error && <WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
    {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
  </WorkspacePanel>;
}
