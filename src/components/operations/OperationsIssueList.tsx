import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { getLiveOperationsCommandCenter } from "@/modules/operations/command-center.functions";

type Issue = Awaited<ReturnType<typeof getLiveOperationsCommandCenter>>["issues"][number];

/** A single link and issue description contract across operational views.
 * The source service owns authorization, severity, and issue resolution.
 */
export function OperationsIssueList({ issues, variant }: {
  issues: readonly Issue[];
  variant: "summary" | "detail";
}) {
  if (issues.length === 0) return variant === "detail"
    ? <p className="text-sm">No instructional staffing, capacity or section waitlist exceptions detected.</p>
    : null;
  return <div className={variant === "summary" ? "mt-5 divide-y border bg-card" : "mt-4 space-y-2"}>
    {issues.map(issue => variant === "summary"
      ? <article key={issue.kind+issue.sectionId} className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <h3 className="font-semibold">{issue.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{issue.description}</p>
          </div>
          <Link to="/launch/school/$programId" params={{programId:issue.programId}}
            search={{siteId:undefined,programId:undefined}}
            className="inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-sm font-semibold">
            Review workflow <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </article>
      : <article key={issue.kind+issue.sectionId} className="border p-3 text-sm">
          <h3 className="font-semibold">{issue.title}</h3>
          <p className="text-muted-foreground">{issue.description}</p>
          <Link className="mt-2 inline-block underline" to="/launch/school/$programId"
            params={{programId:issue.programId}} search={{siteId:undefined,programId:undefined}}>
            Review lifecycle
          </Link>
        </article>)}
  </div>;
}
