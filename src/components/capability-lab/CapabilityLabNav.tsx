import { Link } from "@tanstack/react-router";

const linkClass = "inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary";
const currentClass = "border-primary text-primary";
const inactiveClass = "border-transparent text-muted-foreground hover:text-foreground";

export function CapabilityLabNav({ current, surveyDraftEnabled = false, surveyPublicationEnabled = false }: {
  current: "index" | "enrollment" | "noncredit" | "surveys" | "credentials" | "deployments" | "readiness" | "site-qualification" | "survey-drafts" | "survey-publications" | "facilitated" | "impact" | "devices";
  surveyDraftEnabled?: boolean;
  surveyPublicationEnabled?: boolean;
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
    <Link to="/canonical/lab/facilitated"
      aria-current={current === "facilitated" ? "page" : undefined}
      className={linkClass + " " + (current === "facilitated" ? currentClass : inactiveClass)}>Facilitated delivery</Link>
    <Link to="/canonical/lab/impact"
      aria-current={current === "impact" ? "page" : undefined}
      className={linkClass + " " + (current === "impact" ? currentClass : inactiveClass)}>Participation evidence</Link>
    <Link to="/canonical/lab/devices" aria-current={current === "devices" ? "page" : undefined}
      className={linkClass + " " + (current === "devices" ? currentClass : inactiveClass)}>Site devices</Link>
    <Link to="/canonical/lab/enrollment" aria-current={current === "enrollment" ? "page" : undefined}
      className={linkClass + " " + (current === "enrollment" ? currentClass : inactiveClass)}>Enrollment</Link>
    <Link to="/canonical/lab/noncredit" aria-current={current === "noncredit" ? "page" : undefined}
      className={linkClass + " " + (current === "noncredit" ? currentClass : inactiveClass)}>Noncredit testing</Link>
    <Link to="/canonical/lab/credentials" aria-current={current === "credentials" ? "page" : undefined}
      className={linkClass + " " + (current === "credentials" ? currentClass : inactiveClass)}>Credential previews</Link>
    {(surveyDraftEnabled || current === "survey-drafts") && <Link to="/canonical/lab/survey-drafts" aria-current={current === "survey-drafts" ? "page" : undefined}
      className={linkClass + " " + (current === "survey-drafts" ? currentClass : inactiveClass)}>Survey drafts</Link>}
    {(surveyPublicationEnabled || current === "survey-publications") && <Link to="/canonical/lab/survey-publications"
      aria-current={current === "survey-publications" ? "page" : undefined}
      className={linkClass + " " + (current === "survey-publications" ? currentClass : inactiveClass)}>Survey publication</Link>}
    <Link to="/canonical/lab/surveys" aria-current={current === "surveys" ? "page" : undefined}
      className={linkClass + " " + (current === "surveys" ? currentClass : inactiveClass)}>Survey inspection</Link>
  </nav>;
}
