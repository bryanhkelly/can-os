import { EvidenceUploader, type EvidenceUploaderProps, type EvidenceMimeType } from "./EvidenceUploader";

export interface EvidenceUploadSectionProps<T extends {
  fileName: string; mimeType: EvidenceMimeType; size: number; expiresAt: string;
}> extends EvidenceUploaderProps<T> {
  heading: string;
  unavailableMessage?: string;
}

/** Shared evidence submission heading, deployment warning and upload control. */
export function EvidenceUploadSection<T extends {
  fileName: string; mimeType: EvidenceMimeType; size: number; expiresAt: string;
}>({ heading, unavailableMessage, ...uploader }: EvidenceUploadSectionProps<T>) {
  return <div className="mt-3 border-t pt-3">
    <p className="text-xs font-medium">{heading}</p>
    {uploader.disabled && unavailableMessage && <p role="status" className="mt-2 text-xs">
      {unavailableMessage}
    </p>}
    <EvidenceUploader<T> {...uploader}/>
  </div>;
}
