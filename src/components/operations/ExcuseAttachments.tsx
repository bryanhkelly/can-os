import { useEffect, useRef, useState } from "react";

export type ExcuseAttachmentSummary = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

const BYTE_UNITS = ["B", "KB", "MB"];

function formatBytes(sizeBytes: number): string {
  let value = sizeBytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/**
 * Review/download affordance for an excuse attachment. The URL is requested
 * on demand by the parent's browser: /api/documents is the sole authorization
 * gate, and this component never decides eligibility itself.
 */
function ExcuseAttachmentLink({ attachment, disabled }: { attachment: ExcuseAttachmentSummary; disabled: boolean }) {
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);
  const open = async () => {
    setOpening(true);
    setOpenError("");
    try {
      const response = await fetch(`/api/documents/${attachment.id}`, { credentials: "include" });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setOpenError("Unable to open attachment.");
    } finally {
      setOpening(false);
    }
  };
  return (
    <li className="text-xs">
      <button type="button" onClick={() => void open()} disabled={disabled || opening}
        className="underline disabled:opacity-50">
        {opening ? "Opening…" : attachment.fileName}
      </button>{" "}
      <span className="text-muted-foreground">
        ({attachment.contentType}, {formatBytes(attachment.sizeBytes)})
      </span>
      {openError && <span role="alert" className="ml-2">{openError}</span>}
    </li>
  );
}

/** Staff-facing read-only list of the excuse's attachments. */
export function ExcuseAttachments({ attendanceEventId, attachments, disabled }: {
  attendanceEventId: string;
  attachments: ExcuseAttachmentSummary[];
  disabled: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <div className="mt-3" data-testid={`excuse-attachments-${attendanceEventId}`}>
      <p className="text-xs font-semibold">Attachments</p>
      <ul className="mt-1 list-disc pl-5">
        {attachments.map((attachment) => (
          <ExcuseAttachmentLink key={attachment.id} attachment={attachment} disabled={disabled} />
        ))}
      </ul>
    </div>
  );
}
