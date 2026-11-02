import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function ActionDialog({ open, title, description, confirmLabel, pending = false,
  confirmDisabled = false, onConfirm, onClose, children }: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
    aria-busy={pending} className="m-auto w-full max-w-lg rounded-xl border bg-card p-6 text-foreground shadow-xl backdrop:bg-foreground/40"
    onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (!pending && !confirmDisabled) onConfirm(); }}>
      <h2 id={titleId} className="font-serif text-2xl">{title}</h2>
      <div id={descriptionId} className="mt-3 text-sm text-muted-foreground">{description}</div>
      <fieldset disabled={pending} className="mt-4 space-y-3">{children}</fieldset>
      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending || confirmDisabled}>{pending ? "Saving..." : confirmLabel}</Button>
      </div>
    </form>
  </dialog>;
}
