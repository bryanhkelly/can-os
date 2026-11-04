import { Slot } from "@radix-ui/react-slot";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A titled group of related fields on a dedicated create/edit page. */
export function FormSection({ title, description, children, className }: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return <section aria-labelledby={id} data-form-section="" className={cn("border-t border-border/60 pt-6 first:border-t-0 first:pt-0", className)}>
    <h2 id={id} className="text-lg font-semibold">{title}</h2>
    {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
    <div className="mt-4 grid gap-5 sm:grid-cols-2">{children}</div>
  </section>;
}

/**
 * Consistent submit/cancel footer: the primary submit first, then Cancel as a
 * quiet link back to the context the user came from.
 */
export function FormActions({ submitLabel, pendingLabel, pending, disabled, cancel }: {
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  disabled?: boolean;
  cancel: ReactElement;
}) {
  return <div data-form-actions="" className="mt-8 flex flex-wrap items-center gap-3 border-t border-border/60 pt-6">
    <Button type="submit" size="lg" disabled={pending || disabled}>{pending ? pendingLabel : submitLabel}</Button>
    <Slot className={buttonVariants({ variant: "ghost", size: "lg" })}>{cancel}</Slot>
  </div>;
}

/**
 * Confirms before in-app navigation or unload discards a dirty form. Call the
 * returned `release` immediately before navigating after a confirmed save.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  const released = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useBlocker({
    shouldBlockFn: () => dirtyRef.current && !released.current
      && !window.confirm("Leave this page? Your unsaved changes will be lost."),
    enableBeforeUnload: () => dirtyRef.current && !released.current,
    withResolver: false,
  });
  return useCallback(() => { released.current = true; }, []);
}
