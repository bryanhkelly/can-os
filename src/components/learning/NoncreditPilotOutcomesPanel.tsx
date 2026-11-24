import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState, StatCard, WorkspaceNotice } from "@/components/workspace";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { getNoncreditPilotOutcomes } from "@/modules/learning/noncredit-pilot-outcomes.functions";
import { NONCREDIT_PILOT_COUNT_DEFINITIONS } from "@/domain/noncredit-pilot-outcomes";
type Report=Awaited<ReturnType<typeof getNoncreditPilotOutcomes>>;

const count=(n:number)=>n.toLocaleString("en-US");

/** Reusable, provider-only learning-outcomes panel, using Design System 6.1. */
export function NoncreditPilotOutcomesPanel(){
  const [showDefinitions,setShowDefinitions]=useState(false);
  const {session,error:sessionError}=useWorkspaceSession();
  const authorizedSession=session?.authenticated&&!sessionError?session:null;
  const scope=authorizedSession?JSON.stringify([authorizedSession.activeGrantId,authorizedSession.role,authorizedSession.activeContext,authorizedSession.ownerDelegation??null]):null;
  const query=useQuery<Report>({
    queryKey:["noncredit-pilot-outcomes",scope],
    enabled:scope!==null,
    queryFn:()=>getNoncreditPilotOutcomes({data:{}}),
    retry:false,
    staleTime:30_000,
  });
  const report=scope!==null&&!query.isError?query.data:undefined;
  const summary=report?.totals;
  if(scope===null)return <WorkspaceNotice tone="attention">A current verified provider session is required to view program evidence.</WorkspaceNotice>;
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
          Reporting window (UTC): {report.from.slice(0,10)} inclusive to {report.to.slice(0,10)} exclusive.
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {NONCREDIT_PILOT_COUNT_DEFINITIONS.map(def=>{
          const value=def.key==="distinctLearners"
            ?report!.distinctLearners
            :summary[def.key];
          return <StatCard key={def.key} label={def.label} value={count(value)}/>;
        })}
      </div>
      <WorkspaceNotice>Verified learning hours and participating congregation counts are not available in this report. Lesson ticks, playback and registrations must not be substituted for either measure.</WorkspaceNotice>
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
      <section className="border border-border bg-card p-4">
        <Button type="button" variant="ghost" aria-expanded={showDefinitions}
          onClick={()=>setShowDefinitions(v=>!v)}
          className="flex w-full justify-between gap-4 px-0 text-left">
          Metric definitions and evidence sources
          <span aria-hidden="true">{showDefinitions?"−":"+"}</span>
        </Button>
        {showDefinitions&&<Table scrollLabel="Pilot metric definitions" aria-label="Pilot metric definitions"
          className="mt-3 w-full min-w-[36rem] text-left text-sm">
          <TableCaption className="sr-only">Pilot metric definitions and authoritative sources</TableCaption>
          <TableHeader className="border-b border-border">
            <TableRow>
              <TableHead scope="col" className="p-3">Metric</TableHead>
              <TableHead scope="col" className="p-3">Source</TableHead>
              <TableHead scope="col" className="p-3">Counting rule</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{NONCREDIT_PILOT_COUNT_DEFINITIONS.map(def=>
            <TableRow key={def.key} className="border-b last:border-b-0">
              <TableRowHead className="p-3">{def.label}</TableRowHead>
              <TableCell className="p-3 font-mono text-xs">{def.source}</TableCell>
              <TableCell className="p-3">{def.denominator}. {def.rule} {def.timeBasis}.</TableCell>
            </TableRow>)}</TableBody>
        </Table>}
      </section>
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
