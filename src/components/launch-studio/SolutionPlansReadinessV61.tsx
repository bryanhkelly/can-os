import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { ReadinessRecord, LaunchReadinessSolutions } from "./launch-readiness-types-v61";

/** Presentation only: no independent readiness authorization, storage or commands. */
export function SolutionPlansReadinessV61({ siteId,solutions }: {
  siteId: string; solutions: ReadinessRecord<LaunchReadinessSolutions>;
}) {
  return <section className="border bg-background p-4" aria-label="Solution planning state">
        <h3 className="text-sm font-semibold">Solution plans</h3>
        {solutions.state==="loading" && <p role="status" className="mt-2 text-sm">Loading Solution plans…</p>}
        {solutions.state==="unavailable" && <WorkspaceNotice tone="attention" className="mt-3">
          Solution planning records are unavailable or your current account cannot view them. No status is inferred.
        </WorkspaceNotice>}
        {solutions.state==="ready" && (solutions.value.configurations.length
          ? <ul className="mt-3 space-y-2">{solutions.value.configurations.map(plan=>{
              const model = solutions.value.templates.find(template =>
                template.blueprintVersionId === plan.blueprintVersionId);
              return <li key={plan.configurationId}
                className="flex flex-wrap items-center justify-between gap-3 border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{plan.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {model ? model.title + " · v" + model.versionNo + " · " : ""}
                    Saved revision {plan.revision}
                  </p>
                  {model ? <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {model.components.filter(item => item.requirementMode === "required").length}
                      {" "}required components in the published Solution. These are not verified Site readiness.
                    </p>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-medium text-primary">
                        View published Solution requirements
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {model.components.map(component => <li key={component.id}
                          className="border-l-2 border-border pl-3">
                          <span className="font-medium capitalize">
                            {component.key.replaceAll("_", " ")}
                          </span>
                          <span className="text-muted-foreground">
                            {" · "}{component.requirementMode}
                          </span>
                          {component.description && <p className="mt-1 leading-5 text-muted-foreground">
                            {component.description}
                          </p>}
                        </li>)}
                      </ul>
                    </details>
                  </> : <p className="mt-1 text-xs text-muted-foreground">
                    This saved Solution version is not available for preview. Review the plan for details.
                  </p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="neutral">{plan.lifecycle==="frozen"?"Submitted for review":"Private planning draft"}</StatusBadge>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/launch/site" search={{siteId, module:"program-catalog",
                      solutionPlanId:plan.configurationId}}>
                      {plan.lifecycle==="frozen" ? "Review plan" : "Continue plan"}
                    </Link>
                  </Button>
                </div>
              </li>;
            })}</ul>
          : <p className="mt-2 text-sm text-muted-foreground">
              No saved Solution plans for this Site.{" "}
              <Link to="/launch/site" search={{siteId, module:"program-catalog"}}
                className="font-semibold text-primary underline">Open Program Catalog</Link> to begin.
            </p>)}
      </section>;
}
