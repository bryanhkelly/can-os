import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState } from "@/components/workspace";
import { getNoncreditPilotOutcomes } from "@/modules/learning/noncredit-pilot-outcomes.functions";
type Report=Awaited<ReturnType<typeof getNoncreditPilotOutcomes>>;

const count=(n:number)=>n.toLocaleString("en-US");

/** Reusable, provider-only learning-outcomes panel, using Design System 6.1. */
export function NoncreditPilotOutcomesPanel(){
  const query=useQuery<Report>({
    queryKey:["noncredit-pilot-outcomes"],
    queryFn:()=>getNoncreditPilotOutcomes({data:{}}),
    retry:false,
    staleTime:30_000,
  });
  const report=query.data;
  const summary=report?.totals;
  return <section aria-label="Noncredit program evidence" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl font-semibold">Program evidence</h2>
        <p className="text-sm text-muted-foreground">
          Private provider-scoped outcomes for the previous 90 days.
          Unique learner reach is deduplicated across authorized Sites and training
          registrations. Learning, feedback and completion are tracked per registration.
        </p>
        {report&&<p className="text-xs text-muted-foreground">
          Reporting period: {report.from.slice(0,10)} through {report.to.slice(0,10)} (UTC).
        </p>}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={query.isFetching}
        loading={query.isFetching} onClick={()=>void query.refetch()}>
        Refresh evidence
      </Button>
    </div>
    <QueryState loading={query.isPending?"Loading verified program evidence…":undefined}
      error={query.isError?"Program evidence is unavailable or exceeds the bounded report size.":undefined}
      retrying={query.isFetching} onRetry={()=>void query.refetch()}/>
    {summary?.registrations===0&&<EmptyState
      title="No registrations in this reporting window"
      description="Publish approved training and an enrollment release. Results appear here after learners register and participate."/>}
    {summary&&summary.registrations>0&&<>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {([
          ["Unique learners",report.distinctLearners],
          ["Training registrations",summary.registrations],
          ["Engaged registrations",summary.engagedParticipants],
          ["Lessons marked complete",summary.lessonsMarkedComplete],
          ["Registrations with a knowledge check",summary.knowledgeCheckSubmissions],
          ["Passed final knowledge checks",summary.knowledgeCheckPasses],
          ["Registrations with feedback",summary.surveyRespondents],
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
      {!!report?.byTraining.length&&<div className="border border-border bg-card">
        <Table scrollLabel="Training participation and outcome counts" aria-label="Training participation and outcome counts" className="w-full text-left text-sm"><TableCaption className="sr-only">Training participation and outcome counts</TableCaption>
          <TableHeader className="border-b bg-muted/40 text-xs text-muted-foreground">
            <TableRow><TableHead className="p-3" scope="col">Training</TableHead>
              <TableHead className="p-3" scope="col">Registered</TableHead>
              <TableHead className="p-3" scope="col">Engaged</TableHead>
              <TableHead className="p-3" scope="col">Passed</TableHead>
              <TableHead className="p-3" scope="col">Completed</TableHead></TableRow>
          </TableHeader>
          <TableBody>{report.byTraining.map(item=>
            <TableRow key={item.trainingVersionId} className="border-b last:border-b-0">
              <TableRowHead  className="p-3 font-medium">{item.title}</TableRowHead>
              <TableCell className="p-3 tabular-nums">{count(item.summary.registrations)}</TableCell>
              <TableCell className="p-3 tabular-nums">{count(item.summary.engagedParticipants)}</TableCell>
              <TableCell className="p-3 tabular-nums">{count(item.summary.knowledgeCheckPasses)}</TableCell>
              <TableCell className="p-3 tabular-nums">{count(item.summary.confirmedNoncreditCompletions)}</TableCell>
            </TableRow>)}</TableBody>
        </Table>
      </div>}
      <p className="text-xs text-muted-foreground">
        Internal access is provider-scoped. Separate publication-safe outputs
        suppress small groups; this view is not an external impact report.
      </p>
    </>}
  </section>;
}
