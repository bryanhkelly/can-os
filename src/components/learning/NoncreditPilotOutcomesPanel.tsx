import { useEffect,useState } from "react";
import { getNoncreditPilotOutcomes } from "@/modules/learning/noncredit-pilot-outcomes.functions";
type Report=Awaited<ReturnType<typeof getNoncreditPilotOutcomes>>;

const count=(n:number)=>n.toLocaleString("en-US");

/** Reusable, provider-only learning-outcomes panel, using Design System 6.1. */
export function NoncreditPilotOutcomesPanel(){
  const [report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    void getNoncreditPilotOutcomes({data:{}})
      .then(data=>{if(active)setReport(data);})
      .catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[]);
  const summary=report?.totals;
  return <section aria-label="Noncredit program evidence" className="space-y-4">
    <div className="space-y-1">
      <h2 className="font-serif text-2xl font-semibold">Program evidence</h2>
      <p className="text-sm text-muted-foreground">
        Provider-private, noncredit operational outcomes for the preceding 90 days.
        These measures distinguish participation, demonstrated understanding,
        feedback and formally recorded training completion.
      </p>
    </div>
    {error&&<p role="alert" className="border border-border p-3 text-sm">
      Program evidence is currently unavailable.
    </p>}
    {!error&&!report&&<p role="status" className="text-sm">Loading pilot outcomes...</p>}
    {summary&&<>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {([
          ["Registrations",summary.registrations],
          ["Engaged learners",summary.engagedParticipants],
          ["Lessons marked complete",summary.lessonsMarkedComplete],
          ["Knowledge checks submitted",summary.knowledgeCheckSubmissions],
          ["Passed final knowledge checks",summary.knowledgeCheckPasses],
          ["Feedback respondents",summary.surveyRespondents],
          ["Confirmed completions",summary.confirmedNoncreditCompletions],
          ["Paired before/after checks",summary.pairedKnowledgeChecks],
        ] as const).map(([label,value])=>
          <div key={label} className="border border-border bg-card p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums">{count(value)}</dd>
          </div>)}
      </dl>
      <div className="border border-border bg-card p-4">
        <h3 className="font-semibold">Demonstrated learning improvement</h3>
        <p className="mt-1 text-sm">
          {summary.pairedKnowledgeChecks>0&&summary.averageImprovementPercentagePoints!==null
            ?`${summary.averageImprovementPercentagePoints.toFixed(1)} percentage points from ${count(summary.pairedKnowledgeChecks)} valid baseline/final pairs`
            :"Not yet measurable. A submitted baseline must precede a finalized follow-up check."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          A knowledge-check pass is not an academic grade, credential or
          proof of verified participation minutes.
        </p>
      </div>
      {!!report?.byTraining.length&&<div className="overflow-x-auto border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr><th className="p-3" scope="col">Training</th>
              <th className="p-3" scope="col">Registered</th>
              <th className="p-3" scope="col">Engaged</th>
              <th className="p-3" scope="col">Passed</th>
              <th className="p-3" scope="col">Completed</th></tr>
          </thead>
          <tbody>{report.byTraining.map(item=>
            <tr key={item.trainingVersionId} className="border-b last:border-b-0">
              <th scope="row" className="p-3 font-medium">{item.title}</th>
              <td className="p-3 tabular-nums">{count(item.summary.registrations)}</td>
              <td className="p-3 tabular-nums">{count(item.summary.engagedParticipants)}</td>
              <td className="p-3 tabular-nums">{count(item.summary.knowledgeCheckPasses)}</td>
              <td className="p-3 tabular-nums">{count(item.summary.confirmedNoncreditCompletions)}</td>
            </tr>)}</tbody>
        </table>
      </div>}
      <p className="text-xs text-muted-foreground">
        Internal access is provider-scoped. Separate publication-safe outputs
        suppress small groups; this view is not an external impact report.
      </p>
    </>}
  </section>;
}
