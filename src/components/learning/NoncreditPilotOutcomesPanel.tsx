import {useProviderReportFilters} from "@/hooks/use-provider-report-filters";
import {useProviderReportOptions} from "@/hooks/use-provider-report-options";
import {resolveProviderOutcomeSelection} from "@/domain/report-filter-state";
import {ProviderReportFilters} from "@/components/reports/ProviderReportFilters";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "@/components/ui/table";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {ReportDateFilter} from "@/components/workspace/report-date-filter";
import {reportDefinitionId} from "@/domain/report-catalog";
import { ReportDocumentView } from "@/components/workspace/report-document";
import { bindRegisteredCounts,pilotOutcomeDefinitions } from "@/domain/reporting-view-definitions";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState, WorkspaceNotice } from "@/components/workspace";
import { getNoncreditPilotOutcomes } from "@/modules/learning/noncredit-pilot-outcomes.functions";
import {ReportMetricCard} from "@/components/workspace/report-metric-card";
import {formatReportValue} from "@/domain/report-value-format";
import { NONCREDIT_PILOT_COUNT_DEFINITIONS } from "@/domain/noncredit-pilot-outcomes";

const count=(n:number)=>formatReportValue(n);

/** Reusable, provider-only learning-outcomes panel, using Design System 6.1. */
export function NoncreditPilotOutcomesPanel(){
  const [showDefinitions,setShowDefinitions]=useState(false);
  const scope=usePrivateReportScope();
  const controller=useProviderReportFilters(scope);
  const {geography,siteId,outcomePeriod:{range}}=controller.filters;
  const options=useProviderReportOptions(scope,"historical",controller.filters);
  const selection=resolveProviderOutcomeSelection(controller.filters,new Date());
  const {rolling}=selection;
  const {query,data:report}=usePrivateReportQuery({
    scope,key:selection.key,
    enabled:options.ready&&selection.valid,read:()=>getNoncreditPilotOutcomes({data:selection.input}),
  });
  const summary=report?.totals;
  if(scope===null)return <WorkspaceNotice tone="attention">A current verified provider session is required to view program evidence.</WorkspaceNotice>;
  return <section aria-label="Noncredit program evidence" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl font-semibold">Program evidence</h2>
        <p className="text-sm text-muted-foreground">
          Private provider-scoped outcomes for the selected registration cohort.
          Unique learner reach is deduplicated across authorized Sites and training
          registrations. Learning, feedback and completion are tracked per registration.
        </p>
        {report&&<p className="text-xs text-muted-foreground">
          Reporting window (UTC): {report.from} inclusive to {report.to} exclusive.
        </p>}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={!options.ready||!selection.valid||query.isFetching}
        loading={query.isFetching} onClick={()=>void query.refetch()}>
        Refresh evidence
      </Button>
    </div>
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{rolling?"Showing the last 90 days through the current time (including today).":"Showing a selected closed UTC cohort."}</p>
      {!rolling&&<Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={()=>controller.dispatch({type:"rolling"})}>Use rolling 90 days</Button>}
      <ProviderReportFilters controller={controller} options={options} basis="historical"/>
      <ReportDateFilter key={range.fromDay+":"+range.untilDay} initial={range} maxDays={366} onApply={next=>{
        if(!rolling&&next.fromDay===range.fromDay&&next.untilDay===range.untilDay){if(options.ready)void query.refetch();}else controller.dispatch({type:"closed",range:next});
      }} disabled={query.isFetching}/>
    </div>
    {options.ready&&selection.valid&&<QueryState loading={query.isPending||query.isFetching?"Loading verified program evidence…":undefined}
      error={query.isError?"Program evidence is unavailable or exceeds the bounded report size.":undefined}
      retrying={query.isFetching} onRetry={()=>void query.refetch()}/>}
    {options.ready&&!selection.valid&&<WorkspaceNotice tone="attention">Choose a valid completed UTC reporting period.</WorkspaceNotice>}
    {summary?.registrations===0&&<EmptyState
      title="No registrations in this reporting window"
      description="No registrations match the selected Site, historical geography and reporting period."/>}
    {summary&&summary.registrations>0&&<>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {NONCREDIT_PILOT_COUNT_DEFINITIONS.map(def=>{
          const value=def.key==="distinctLearners"
            ?report!.distinctLearners
            :summary[def.key];
          return <ReportMetricCard key={def.key} item={{id:def.key,label:def.label,value,asOf:report!.asOf}}/>;
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ReportMetricCard item={{id:"participant-hours",label:"Recorded participant hours",value:summary.verifiedParticipationMinutes/60,format:"hours",hint:"Verified minutes divided by 60; not unique person time"}}/>
        <ReportMetricCard item={{id:"delivery-sites",label:"Delivery Sites with registrations",value:report!.deliverySites,hint:"Authorized Sites, not a count of congregations"}}/>
      </div>
      <ReportDocumentView report={{version:1,definitionId:reportDefinitionId("noncredit-registration-outcomes"),title:"Registration outcomes",
        scopeLabel:(options.sites.data?.find(option=>option.id===siteId)?.label??(siteId||"All authorized Sites"))+" · "+(options.geography.data?.find(option=>option.code===geography)?.name??(geography||"All delivery geographies")),asOf:report!.asOf,basis:"Registration cohort; evidence current at report generation",
        definitions:pilotOutcomeDefinitions(),blocks:[{id:"outcomes",kind:"chart",spec:{
          title:"Registration outcome counts",description:"Measures overlap; do not add them or treat them as a sequential funnel.",
          valueLabel:"Registrations",kind:"comparison",format:"count",
          points:bindRegisteredCounts(pilotOutcomeDefinitions(),summary),
        }}]}}/>
      <WorkspaceNotice>Only source-verified participation minutes are counted. Lesson ticks, playback and registrations are not evidence of attendance. National congregation reach requires independently authorized network attribution.</WorkspaceNotice>
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
