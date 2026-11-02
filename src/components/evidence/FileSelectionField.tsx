import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  return <div className="text-sm"><Label htmlFor={inputId}>{label}</Label>
    <Input id={inputId} ref={input} type="file" accept={accept} disabled={disabled} required={required}
      aria-describedby={file ? descriptionId : undefined}
      className="mt-1"
      onChange={event => onChange(event.target.files?.[0] ?? null)} />
    {file && <span id={descriptionId} className="mt-1 block text-xs text-muted-foreground">
      Selected: {file.name}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} className="ml-2 underline"
        onClick={() => { if (input.current) input.current.value = ""; onChange(null); }}>Clear file</Button>
    </span>}
  </div>;
}

export function UploadedFileNotice({ children }: { children?: ReactNode }) {
  return <p role="status" className="mt-2 text-sm">
    {children ?? "The private file is uploaded. Retry recording without uploading the bytes again."}
  </p>;
}
