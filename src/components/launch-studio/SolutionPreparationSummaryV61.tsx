import { Link } from "@tanstack/react-router";
import { WorkspacePanel, EmptyState, DisclosureSection, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { SolutionPreparationViewV61 } from "@/domain/site-solution-preparation-v61";

/** Same saved-plan summary for Prepare and Open; all statuses are read-only. */
export function SolutionPreparationSummaryV61({siteId,plans,open=false}:{
  siteId:string;plans:readonly SolutionPreparationViewV61[];open?:boolean;
}){
  return <WorkspacePanel headingLevel="h3" title="Your solution plans">
    <p className="mt-1 text-xs leading-5 text-muted-foreground">
      These are the solutions you're preparing. Each one may need staff, spaces,
      schedules, and approvals before it can be offered.
    </p>
    {!plans.length?<EmptyState title="No solution plans saved yet" description="Explore the Program Catalog to begin."/>:<div className="mt-4 space-y-3">{plans.map(plan=>
      <WorkspacePanel key={plan.configurationId} headingLevel="h4" title={plan.name}
        description={(plan.template??"Solution details unavailable")+(plan.templateVersion!==null?" · v"+plan.templateVersion:"")+" · Saved version "+plan.revision}
        actions={<StatusBadge tone={plan.nextAction==="resolve-template"?"attention":"neutral"}>{plan.nextAction==="resolve-template"?"Check solution version":plan.lifecycle==="frozen"?"Submitted for review":"Saved draft"}</StatusBadge>}>
        <p className="mt-3 text-sm">
          {plan.requiredComponents.length} required {plan.requiredComponents.length===1?"part":"parts"} to prepare
          {plan.componentReviewNeeded>0
            ?" · "+plan.componentReviewNeeded+" need independent review":""}.
        </p>
        {plan.requiredComponents.length>0&&<DisclosureSection headingLevel="h5" title="View requirements" className="mt-2">
          <ul className="mt-2 space-y-2">{plan.requiredComponents.map(component=>
            <li key={component.key} className="border-l-2 pl-3">
              <strong className="capitalize">{component.key.replaceAll("_"," ")}</strong>
              {component.independentReview&&<span className="text-muted-foreground">
                {" · Separate review required"}</span>}
              {component.description&&<p className="text-xs text-muted-foreground">{component.description}</p>}
            </li>)}</ul>
        </DisclosureSection>}
        {open&&<div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>Learning offering published: {plan.publishedProduct?"Yes":"Not confirmed"}</p>
          <p>Registration options: {plan.publisherCandidateCount===null?"Could not be checked":
            plan.publisherCandidateCount>0?"Potential option available":"None confirmed yet"}</p>
          <p>Active noncredit registrations: {plan.openRegistrationCount===null?"Unavailable":
            plan.openRegistrationCount}</p>
          <p>Complete all required approvals before opening registration.</p>
        </div>}
        <Link to="/launch/site" search={{siteId,module:"program-catalog",
          solutionPlanId:plan.configurationId}}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
          {plan.nextAction==="continue-plan"?"Continue this Solution":"Review this Solution"}
        </Link>
      </WorkspacePanel>)}</div>}
    <WorkspaceNotice tone="info" className="mt-3">
      Your plan shows what may be needed. Complete the appropriate reviews before you begin offering it or accepting registration.
    </WorkspaceNotice>
  </WorkspacePanel>;
}
