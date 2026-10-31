export function CurriculumPdfPicker({
  enabled, busy, fileKey, selectedFile, rightsConfirmed, onFileChange, onRightsChange,
}: {
  enabled: boolean;
  busy: boolean;
  fileKey: number;
  selectedFile: File | null;
  rightsConfirmed: boolean;
  onFileChange: (file: File | null) => void;
  onRightsChange: (confirmed: boolean) => void;
}) {
  return <>
    <p className="text-xs text-muted-foreground">
      Upload a PDF directly to CAN's private storage. It is visible only in the selected program, site or class and downloadable by authorized class members.
    </p>
    <input key={fileKey} type="file" accept=".pdf,application/pdf" disabled={busy || !enabled}
      onChange={event => onFileChange(event.currentTarget.files?.[0] ?? null)}
      className="block w-full text-sm" aria-label="Supplemental PDF"/>
    <label className="flex items-start gap-2 text-xs">
      <input type="checkbox" checked={rightsConfirmed} disabled={busy || !enabled}
        onChange={event => onRightsChange(event.currentTarget.checked)}/>
      <span>I have permission to share this material with authorized learners. Uploading does not authorize AI training or public redistribution.</span>
    </label>
    {selectedFile && <p className="text-xs text-muted-foreground">Selected: {selectedFile.name}</p>}
  </>;
}
