import { useEffect, useId, useRef, type ReactNode } from "react";

export function FileSelectionField({ label, accept, file, onChange, disabled, required }: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const descriptionId = useId();
  useEffect(() => { if (!file && input.current) input.current.value = ""; }, [file]);
  return <div className="text-sm"><label htmlFor={inputId}>{label}</label>
    <input id={inputId} ref={input} type="file" accept={accept} disabled={disabled} required={required}
      aria-describedby={file ? descriptionId : undefined}
      className="mt-1 block w-full rounded border p-2"
      onChange={event => onChange(event.target.files?.[0] ?? null)} />
    {file && <span id={descriptionId} className="mt-1 block text-xs text-muted-foreground">
      Selected: {file.name}
      <button type="button" disabled={disabled} className="ml-2 underline"
        onClick={() => { if (input.current) input.current.value = ""; onChange(null); }}>Clear file</button>
    </span>}
  </div>;
}

export function UploadedFileNotice({ children }: { children?: ReactNode }) {
  return <p role="status" className="mt-2 text-sm">
    {children ?? "The private file is uploaded. Retry recording without uploading the bytes again."}
  </p>;
}
