import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * V6.1 action-row geometry, shared across dedicated forms and confirmation dialogs.
 * Consumers retain authority over commands, validation, pending state and button order.
 */
export function ActionFooter({ children, layout = "form", className }: {
  children: ReactNode;
  layout?: "form" | "dialog";
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
        : "mt-5 justify-end",
      className,
    )}>{children}</div>;
}
