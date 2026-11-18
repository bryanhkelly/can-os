import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/** CAN 6.1 discussion editor shared by Class and Study Group.
 * UI only: ownership, moderation, authorization and persistence remain in
 * the existing server commands of the invoking workspace.
 */
export function DiscussionComposer({
  value, onChange, onSubmit, disabled = false, pending = false,
  label = "New post", placeholder = "Share a question or a study tip",
  maxLength = 3000, submitLabel = "Post message", children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  disabled?: boolean;
  pending?: boolean;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  submitLabel?: string;
  children?: ReactNode;
}) {
  const ready = value.trim().length > 0 && value.length <= maxLength;
  return <form noValidate className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (!disabled && !pending && ready) void onSubmit(value);
  }}>
    <Field label={label} required description={`Up to ${maxLength.toLocaleString("en-US")} characters.`}>
      <Textarea value={value} onChange={event => onChange(event.target.value)}
        maxLength={maxLength} rows={3} placeholder={placeholder}
        disabled={disabled || pending} />
    </Field>
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <Button type="submit" size="sm" loading={pending} loadingLabel="Posting…"
        disabled={disabled || pending || !ready}>{submitLabel}</Button>
    </div>
  </form>;
}
