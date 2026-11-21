import type { ChangeEvent, ReactNode } from "react";
import { Checkbox, Radio } from "@/components/ui/choice";
import { cn } from "@/lib/utils";

export type SelectionCardProps = {
  kind: "checkbox" | "radio";
  value?: string;
  name?: string;
  title: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  compact?: boolean;
  className?: string;
};

/**
 * V6.1 selectable option, reused by Site Information and Programs & Audiences.
 * The owning form retains selection limits, validation and persistence.
 */
export function SelectionCard({
  kind, value, name, title, detail, icon, checked, disabled = false,
  onChange, compact = false, className,
}: SelectionCardProps) {
  const controlProps = {
    value, name, checked, disabled,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked),
    className: "mt-0.5",
  };
  return <label className={cn(
    "min-w-0 cursor-pointer border bg-card text-sm focus-within:ring-2 focus-within:ring-ring",
    "focus-within:ring-offset-1",
    compact ? "flex min-h-11 items-start gap-3 p-3" : "flex min-h-20 items-start gap-3 p-4",
    disabled ? "cursor-not-allowed border-border bg-muted/30 opacity-60" :
      checked ? "border-primary bg-accent" : "border-border hover:border-primary/60",
    className,
  )}>
    {kind === "checkbox" ? <Checkbox {...controlProps}/> : <Radio {...controlProps}/>}
    {icon && <span aria-hidden="true" className="shrink-0 text-primary">{icon}</span>}
    <span className="min-w-0">
      <span className="block font-semibold">{title}</span>
      {detail && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>}
    </span>
  </label>;
}
