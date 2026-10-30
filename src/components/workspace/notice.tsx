import * as React from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = { info: Info, success: CircleCheck, danger: CircleAlert };

export const WorkspaceNotice = React.forwardRef<HTMLParagraphElement, {
  children: React.ReactNode;
  tone?: "info" | "success" | "danger";
  className?: string;
}>(({ children, tone = "info", className }, ref) => {
  const Icon = icons[tone];
  return <p ref={ref} tabIndex={-1} role={tone === "danger" ? "alert" : "status"}
    aria-live={tone === "danger" ? "assertive" : "polite"}
    className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring",
      tone === "info" && "border-info/40 bg-info/10",
      tone === "success" && "border-success/50 bg-success/10",
      tone === "danger" && "border-danger/50 bg-danger/10",
      className)}>
    <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
    <span>{children}</span>
  </p>;
});
WorkspaceNotice.displayName = "WorkspaceNotice";
