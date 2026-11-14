import { Link } from "@tanstack/react-router";

const linkClass = "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary";
const currentClass = "border-primary text-primary";
const inactiveClass = "border-transparent text-muted-foreground hover:text-foreground";

export function CapabilityLabNav({ current }: {
  current: "index" | "noncredit" | "surveys" | "credentials" | "deployments" | "readiness" | "site-qualification";
}) {
  return <nav aria-label="Capability Lab sections" className="mt-5 flex flex-wrap gap-2 border-b border-border">
    <Link to="/canonical/capability-lab" aria-current={current === "index" ? "page" : undefined}
      className={linkClass + " " + (current === "index" ? currentClass : inactiveClass)}>Overview</Link>
    <Link to="/canonical/lab/deployments" aria-current={current === "deployments" ? "page" : undefined}
      className={linkClass + " " + (current === "deployments" ? currentClass : inactiveClass)}>Deployments</Link>
    <Link to="/canonical/lab/site-qualification" aria-current={current === "site-qualification" ? "page" : undefined}
      className={linkClass + " " + (current === "site-qualification" ? currentClass : inactiveClass)}>Site qualification</Link>
    <Link to="/canonical/lab/readiness" aria-current={current === "readiness" ? "page" : undefined}
      className={linkClass + " " + (current === "readiness" ? currentClass : inactiveClass)}>Assessment catalog</Link>
    <Link to="/canonical/lab/facilitated" aria-current={current === "facilitated" ? "page" : undefined}
      className={linkClass + " " + (current === "facilitated" ? currentClass : inactiveClass)}>Facilitated delivery</Link>
    <Link to="/canonical/lab/impact" aria-current={current === "impact" ? "page" : undefined}
      className={linkClass + " " + (current === "impact" ? currentClass : inactiveClass)}>Participation evidence</Link>
    <Link to="/canonical/lab/noncredit" aria-current={current === "noncredit" ? "page" : undefined}
      className={linkClass + " " + (current === "noncredit" ? currentClass : inactiveClass)}>Noncredit testing</Link>
    <Link to="/canonical/lab/credentials" aria-current={current === "credentials" ? "page" : undefined}
      className={linkClass + " " + (current === "credentials" ? currentClass : inactiveClass)}>Credential previews</Link>
    <Link to="/canonical/lab/surveys" aria-current={current === "surveys" ? "page" : undefined}
      className={linkClass + " " + (current === "surveys" ? currentClass : inactiveClass)}>Survey inspection</Link>
  </nav>;
}
