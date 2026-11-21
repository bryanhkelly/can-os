import { Link } from "@tanstack/react-router";
import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { SolutionPreparationViewV61 } from "@/domain/site-solution-preparation-v61";

/** Same saved-plan summary for Prepare and Open; all statuses are read-only. */
export function SolutionPreparationSummaryV61({siteId,plans,open=false}:{
  siteId:string;plans:readonly SolutionPreparationViewV61[];open?:boolean;
}){
  return <section className="border bg-background p-4" aria-label="Solution preparation summary">
    <h3 className="text-sm font-semibold">Your Solution preparation</h3>
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      These are saved Site configurations. Published requirements still need
      independently verified facilities, staff, schedules and approvals.
    </p>
    {!plans.length?<p className="mt-3 text-sm text-muted-foreground">
      No saved Solution plans yet. Start with Program Catalog.
    </p>:<div className="mt-4 space-y-3">{plans.map(plan=>
      <article key={plan.configurationId} className="border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{plan.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.template??"Saved template unavailable"}
              {plan.templateVersion!==null?" · v"+plan.templateVersion:""}
              {" · Site revision "+plan.revision}
            </p>
          </div>
          <StatusBadge tone={plan.nextAction==="resolve-template"?"attention":"neutral"}>
            {plan.nextAction==="resolve-template"?"Review source version":
              plan.lifecycle==="frozen"?"Submitted for review":"Private plan"}
          </StatusBadge>
        </div>
        <p className="mt-3 text-sm">
          {plan.requiredComponents.length} required components in the published definition
          {plan.componentReviewNeeded>0
            ?" · "+plan.componentReviewNeeded+" explicitly require independent review":""}.
        </p>
        {plan.requiredComponents.length>0&&<details className="mt-2 text-sm">
          <summary className="cursor-pointer font-medium text-primary">View requirements</summary>
          <ul className="mt-2 space-y-2">{plan.requiredComponents.map(component=>
            <li key={component.key} className="border-l-2 pl-3">
              <strong className="capitalize">{component.key.replaceAll("_"," ")}</strong>
              {component.independentReview&&<span className="text-muted-foreground">
                {" · Independent review required"}</span>}
              {component.description&&<p className="text-xs text-muted-foreground">{component.description}</p>}
            </li>)}</ul>
        </details>}
        {open&&<div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>Published learning product: {plan.publishedProduct?"Present":"Not verified as published"}</p>
          <p>Site publisher eligibility: {plan.publisherCandidateCount===null?"Unavailable":
            plan.publisherCandidateCount>0?"Candidate visible":"No eligible candidate returned"}</p>
          <p>Open noncredit registration releases: {plan.openRegistrationCount===null?"Unavailable":
            plan.openRegistrationCount}</p>
          <p>A visible candidate or saved plan does not authorize registration.</p>
        </div>}
        <Link to="/launch/site" search={{siteId,module:"program-catalog",
          solutionPlanId:plan.configurationId}}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
          {plan.nextAction==="continue-plan"?"Continue this Solution":"Review this Solution"}
        </Link>
      </article>)}</div>}
    <WorkspaceNotice tone="info" className="mt-3">
      Requirements are descriptive until their owning service verifies evidence.
      Nothing on this screen grants operational or enrollment approval.
    </WorkspaceNotice>
  </section>;
}
