import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ActionDialog({ open, title, description, confirmLabel, pending = false,
  confirmDisabled = false, destructive = false, onConfirm, onClose, children }: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return <Modal open={open} label={title} labelledBy={titleId} describedBy={descriptionId}
    busy={pending} className="max-w-lg p-6" initialFocus={cancel}
    dismissOnBackdrop={false} dismissible={!pending} onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (!pending && !confirmDisabled) onConfirm(); }}>
      <h2 id={titleId} className="font-serif text-2xl">{title}</h2>
      <div id={descriptionId} className="mt-3 text-sm text-muted-foreground">{description}</div>
      <fieldset disabled={pending} className="mt-4 space-y-3">{children}</fieldset>
      <div className="mt-5 flex justify-end gap-3">
        <Button ref={cancel} type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" variant={destructive ? "destructive" : "default"}
          disabled={pending || confirmDisabled}>{pending ? "Saving..." : confirmLabel}</Button>
      </div>
    </form>
  </Modal>;
}
