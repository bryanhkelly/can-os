import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

export function Modal({ open, onClose, label, children, className, initialFocus,
  dismissOnBackdrop = true, dismissible = true, keepMounted = false,
  labelledBy, describedBy, busy }: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  initialFocus?: RefObject<HTMLElement | null>;
  dismissOnBackdrop?: boolean;
  dismissible?: boolean;
  keepMounted?: boolean;
  labelledBy?: string;
  describedBy?: string;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOutside = useRef(false);
  function isOutside(event: { clientX: number; clientY: number }, dialog: HTMLDialogElement) {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const previous = document.activeElement;
    dialog.showModal();
    initialFocus?.current?.focus();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, initialFocus]);
  return <dialog ref={ref} aria-label={label} aria-labelledby={labelledBy}
    aria-describedby={describedBy} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (dismissible) onClose(); }}
    onKeyDown={event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (dismissible) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]',
      )).filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}
    onPointerDown={event => {
      startedOutside.current = event.target === event.currentTarget && isOutside(event, event.currentTarget);
    }}
    onClick={event => {
      if (dismissible && dismissOnBackdrop && startedOutside.current
        && event.target === event.currentTarget && isOutside(event, event.currentTarget)) onClose();
      startedOutside.current = false;
    }}
    className={cn("m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[85dvh] overflow-y-auto border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/40", className)}>
    {(open || keepMounted) && children}
  </dialog>;
}
