import { useState } from "react";
import { getExcuseAttachmentDownload } from "@/modules/learning/submission-attachments.functions";

export type ExcuseAttachment = { documentId: string; fileName: string };

/**
 * Reviewer download controls for documents a guardian attached to a pending
 * excuse. The server re-authorizes site/program (and teacher section) scope
 * and audits every download before issuing a short-lived signed URL.
 */
export function ExcuseAttachments({ attendanceEventId, attachments, disabled }: {
  attendanceEventId: string;
  attachments: ExcuseAttachment[];
  disabled?: boolean;
}) {
  const [error, setError] = useState("");
  if (!attachments.length) return null;
  return <div className="mt-3 rounded-lg border p-3" aria-label="Excuse attachments">
    <p className="text-xs font-semibold">Attached documents</p>
    {attachments.map(file => <button
      type="button"
      key={file.documentId}
      disabled={disabled}
      className="mt-1 block text-xs underline disabled:opacity-50"
      onClick={async () => {
        setError("");
        try {
          const result = await getExcuseAttachmentDownload({
            data: { attendanceEventId, documentId: file.documentId },
          });
          window.location.assign(result.downloadUrl);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Unable to open attachment");
        }
      }}
    >{file.fileName}</button>)}
    {error && <p role="alert" className="mt-1 text-xs">{error}</p>}
  </div>;
}
