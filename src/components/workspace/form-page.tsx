import { ActionFooter } from "./action-footer";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A titled group of related fields on a dedicated create/edit page. */
export function FormSection({ title, description, children, className, columns = 2 }: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Use one column for lengthy evidence, consent or free-form review fields. */
  columns?: 1 | 2;
}) {
  const id = useId();
  const descriptionId = useId();
  return <section aria-labelledby={id} aria-describedby={description ? descriptionId : undefined}
    data-form-section="" className={cn("min-w-0 border-t border-border/60 pt-6 first:border-t-0 first:pt-0", className)}>
    <h2 id={id} className="text-lg font-semibold leading-6 [overflow-wrap:anywhere]">{title}</h2>
    {description && <div id={descriptionId} className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{description}</div>}
    <div className={cn("mt-4 grid min-w-0 grid-cols-1 gap-5 [&>*]:min-w-0", columns === 2 && "sm:grid-cols-2")}>{children}</div>
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
  cancel?: ReactElement | null | false;
}) {
  return <ActionFooter layout="form">
    <Button type="submit" size="lg" loading={pending} loadingLabel={pendingLabel} disabled={pending || disabled}>{submitLabel}</Button>
    {cancel && <Button asChild variant="ghost" size="lg" disabled={pending}>{cancel}</Button>}
  </ActionFooter>;
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
