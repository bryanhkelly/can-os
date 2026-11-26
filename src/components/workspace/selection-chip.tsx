import type { ReactNode } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SelectionChipProps = {
  children: ReactNode;
  selected: boolean;
  onChange: (selected: boolean) => void;
  disabled?: boolean;
  density?: "standard" | "compact";
  recommended?: boolean;
};

/** Controlled V6.1 toggle: feature owns values, limits and persistence. */
export function SelectionChip({ children, selected, onChange, disabled = false,
  density = "compact", recommended = false }: SelectionChipProps) {
  return <Button type="button" variant={selected ? "selection-chip-selected" : recommended ? "selection-chip-recommended" : "selection-chip"}
    size={density === "compact" ? "chip-compact" : "chip-standard"} aria-pressed={selected}
    disabled={disabled} onClick={() => onChange(!selected)}
    data-selection-chip={density}
    className="max-w-full min-w-0 gap-1 whitespace-normal text-left [&_svg]:size-3">
    <span aria-hidden="true" className="flex size-3 shrink-0 items-center justify-center">
      {selected ? <Check/> : recommended ? <Sparkles/> : null}
    </span>
    <span>{children}</span>
    {recommended && <span className="sr-only"> (recommended)</span>}
  </Button>;
}

export function SelectionChipGroup({ children, density = "compact" }: {
  children: ReactNode; density?: "standard" | "compact";
}) {
  return <div className={cn("flex min-w-0 flex-wrap", density === "compact" ? "gap-1.5" : "gap-2")}>{children}</div>;
}
