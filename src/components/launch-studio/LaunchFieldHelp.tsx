import { useId, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LaunchFieldHelp({ label, children, align = "start" }: { label: string; children: ReactNode; align?: "start" | "end" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="launch-field-help" data-align={align}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={label} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
      <CircleHelp className="size-4" aria-hidden="true" />
    </Button>
    {open && <span id={id} role="tooltip">{children}</span>}
  </span>;
}
