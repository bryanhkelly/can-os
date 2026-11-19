import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** V6.1 rectangular, independently expandable section. Keeps child state mounted while hidden. */
export function DisclosureSection({ title, description, children, defaultOpen = false, open, onOpenChange, className, id }: {
  title: string; description?: string; children: ReactNode; defaultOpen?: boolean;
  open?: boolean; onOpenChange?: (next: boolean) => void; className?: string; id?: string;
}) {
  const reactId = useId();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const expanded = open ?? localOpen;
  const panelId = id ?? `disclosure-panel-${reactId}`;
  const change = () => { if (onOpenChange) onOpenChange(!expanded); else setLocalOpen(!expanded); };
  return <section className={cn("min-w-0 border border-border bg-card", className)}>
    <h3 className="m-0">
      <Button type="button" variant="ghost" aria-expanded={expanded}
        aria-controls={panelId} onClick={change}
        className="flex min-h-14 h-auto w-full items-start justify-between gap-4 px-4 py-4 text-left sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          {description && <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>}
        </span>
        {expanded ? <ChevronUp aria-hidden="true" className="mt-1 size-4" /> :
          <ChevronDown aria-hidden="true" className="mt-1 size-4" />}
      </Button>
    </h3>
    <div id={panelId} hidden={!expanded} className="min-w-0 border-t border-border px-4 py-4 sm:px-5">
      {children}
    </div>
  </section>;
}
