import { useId, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

export function LaunchFieldHelp({ label, children, align = "start" }: { label: string; children: ReactNode; align?: "start" | "end" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="launch-field-help" data-align={align}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={label} aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
      <CircleHelp className="size-4" aria-hidden="true" />
    </button>
    {open && <span id={id} role="tooltip">{children}</span>}
  </span>;
}
