import * as React from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { focusRingClasses } from "@/components/ui/control-styles";
import { cn } from "@/lib/utils";

const icons = { info: Info, attention: TriangleAlert, success: CircleCheck, danger: CircleAlert };

export const WorkspaceNotice = React.forwardRef<HTMLDivElement, {
  children: React.ReactNode;
  tone?: "info" | "attention" | "success" | "danger";
  className?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}>(({ children, tone = "info", className, onDismiss, dismissLabel = "Dismiss notice" }, ref) => {
  const Icon = icons[tone];
  return <div ref={ref} tabIndex={-1} role={tone === "danger" || tone === "attention" ? "alert" : "status"}
    aria-live={tone === "danger" || tone === "attention" ? "assertive" : "polite"}
    className={cn("flex min-w-0 items-start gap-3 border p-4 text-sm leading-6", focusRingClasses,
      tone === "info" && "border-info/40 bg-info/10",
      tone === "attention" && "border-warning/50 bg-warning/10",
      tone === "success" && "border-success/50 bg-success/10",
      tone === "danger" && "border-danger/50 bg-danger/10",
      className)}>
    <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
    <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
    {onDismiss && <Button type="button" variant="ghost" size="icon"
      aria-label={dismissLabel} onClick={onDismiss} className="-my-1 shrink-0">
      <X aria-hidden="true" />
    </Button>}
  </div>;
});
WorkspaceNotice.displayName = "WorkspaceNotice";
