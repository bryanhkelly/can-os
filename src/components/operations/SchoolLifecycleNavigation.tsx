import { Link } from "@tanstack/react-router";

/**
 * Shared navigation for the school lifecycle. These are routes into existing
 * authorized workspaces, not a new school-status or opening-approval model.
 */
export function SchoolLifecycleNavigation({
  current, siteId, programId,
}: {
  current: "launch" | "run" | "sustain";
  siteId?: string;
  programId?: string;
}) {
  const destinations = [
    { id: "launch", title: "Launch", detail: "Set up and prepare", path: "/operations/launch" },
    { id: "run", title: "Run", detail: "Operate the school", path: "/operations" },
    { id: "sustain", title: "Sustain", detail: "Review and plan", path: "/operations/insights" },
  ] as const;
  return <nav aria-label="School lifecycle" className="mt-4 grid gap-2 rounded-2xl border bg-card p-2 sm:grid-cols-3">
    {destinations.map(item => <Link
      key={item.id}
      to={item.path}
      search={{ siteId, programId }}
      aria-current={current === item.id ? "page" : undefined}
      className={"min-h-16 rounded-xl px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 "+
        (current === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
      <span className="block text-sm font-semibold">{item.title}</span>
      <span className={"mt-1 block text-xs "+(current === item.id ? "text-primary-foreground/80" : "text-muted-foreground")}>{item.detail}</span>
    </Link>)}
  </nav>;
}
