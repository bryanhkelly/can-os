import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * V6.1 action-row geometry, shared across forms, dialogs, inline actions and multi-step workflows.
 * Consumers retain authority over commands, validation, pending state and button order.
 */
export function ActionFooter({ children, layout = "form", className }: {
  children: ReactNode;
  layout?: "form" | "dialog" | "inline" | "step";
  className?: string;
}) {
  return <div
    data-action-footer={layout}
    data-form-actions={layout === "form" ? "" : undefined}
    data-dialog-actions={layout === "dialog" ? "" : undefined}
    className={cn(
      "flex min-w-0 flex-wrap items-center gap-3",
      layout === "form"
        ? "mt-8 border-t border-border/60 pt-6"
        : layout === "dialog" ? "mt-5 justify-end"
        : layout === "step" ? "mt-3 justify-between border-t border-border/60 pt-5" : "mt-3",
      className,
    )}>{children}</div>;
}
