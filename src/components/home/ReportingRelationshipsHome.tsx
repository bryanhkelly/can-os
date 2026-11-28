import {useState} from "react";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {ReportDocumentView,type ReportDocument} from "@/components/workspace/report-document";
import {ContextualReportingRelationships} from "@/components/reporting/ContextualReportingRelationships";
import {WorkspaceShell} from "@/components/workspace";
import {WorkspaceNotice} from "@/components/workspace/notice";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {useWorkspaceSession} from "@/components/shell/WorkspaceSession";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {ReportingRelationshipPanel} from "@/components/reporting/ReportingRelationshipPanel";
import {relationshipScopeKinds,type RelationshipProposal,type RelationshipAction} from "@/domain/bottom-up-reporting-relationships";
import {
  getRelationshipRequests,getRelationshipScopes,getRelationshipPortfolio,decideRelationshipRequest,
} from "@/modules/reporting/bottom-up-reporting-relationships.functions";

type Kind=RelationshipProposal["scopeKind"];
export function ReportingRelationshipsHome(){
  const {session}=useWorkspaceSession();
  const privateScope=usePrivateReportScope();
  if(!privateScope||!session?.authenticated||session.role!=="reporting_relationship_manager")
    return <WorkspaceShell title="Organization relationships"><WorkspaceNotice tone="danger">A direct relationship manager appointment is required.</WorkspaceNotice></WorkspaceShell>;
  return <RelationshipsWorkspace key={privateScope} privateScope={privateScope}/>;
}
function RelationshipsWorkspace({privateScope}:{privateScope:string}){
  const [direction,setDirection]=useState<"outgoing"|"incoming">("outgoing");
  const [requestAfter,setRequestAfter]=useState<string|undefined>();
  const [kind,setKind]=useState<Kind>("organization");
  const [scopeId,setScopeId]=useState("");
  const [scopeAfter,setScopeAfter]=useState<string|undefined>();
  const portfolio=usePrivateReportQuery({scope:privateScope,key:["relationship-portfolio"],read:()=>getRelationshipPortfolio()});
  const requests=usePrivateReportQuery({scope:privateScope,key:["relationships",direction,requestAfter??null],
    read:()=>getRelationshipRequests({data:{direction,after:requestAfter}})});
  const scopes=usePrivateReportQuery({scope:privateScope,key:["relationship-scopes",kind,scopeAfter??null],
    read:()=>getRelationshipScopes({data:{kind,after:scopeAfter}}),enabled:direction==="outgoing"});
  const feedback=useMutationFeedback(async()=>{await Promise.all([requests.query.refetch({throwOnError:true}),portfolio.query.refetch({throwOnError:true})]);});
  const busy=feedback.pending||feedback.refreshFailed;
  const selectedScope=scopes.data?.items.find(item=>item.id===scopeId);
  const error=requests.query.isError||direction==="outgoing"&&scopes.query.isError;
  const inventory=portfolio.data;
  const report:ReportDocument|null=inventory?{
    version:1,definitionId:"relationship-portfolio-v1",title:"Relationship portfolio",
    scopeLabel:inventory.population==="synthetic"?"Synthetic organization inventory":"Current organization inventory",
    basis:"Accepted unexpired relationship terms between active same-population organizations; not reporting execution authority or outcomes.",
    asOf:inventory.asOf,blocks:[{id:"inventory",kind:"metrics",items:[
      {id:"partners",label:"Connected organizations",value:inventory.connectedOrganizations,hint:"Distinct organizations with accepted current terms"},
      {id:"relationships",label:"Accepted relationships",value:inventory.acceptedRelationships,hint:"Current accepted agreement rows"},
      {id:"sharing",label:"Accepted reporting terms",value:inventory.acceptedWithReportingTerms,hint:"Accepted rows with at least one metric; not proof of executable access"},
      {id:"incoming",label:"Awaiting our response",value:inventory.awaitingOurResponse,hint:"Unexpired incoming pending requests"},
      {id:"outgoing",label:"Awaiting partner response",value:inventory.awaitingPartnerResponse,hint:"Unexpired outgoing pending requests"},
      {id:"programs",label:"Directly tagged Programs",value:inventory.taggedPrograms,hint:"Distinct own Programs with accepted direct tags; excludes inherited tags"},
    ]}]}
    :null;
  function decide(agreementId:string,action:RelationshipAction){
    void feedback.run(()=>decideRelationshipRequest({data:{agreementId,action}}),{
      successMessage:"Relationship decision recorded.",
      commandErrorMessage:"Unable to record the relationship decision.",
    });
  }
  return <WorkspaceShell title="Organization relationships" subtitle="Choose the activity and aggregate metrics your organization is willing to share.">
    <div className="space-y-4">
      <WorkspaceNotice>Acceptance records consent only. Partner outcome reports remain unavailable until independently approved disclosure and reporting integration are complete.</WorkspaceNotice>
      {report&&<ReportDocumentView report={report}/>}
      {portfolio.query.isFetching&&<p role="status" className="text-sm">Loading relationship inventory…</p>}
      {portfolio.query.isError&&<WorkspaceNotice tone="danger">Relationship inventory unavailable. <Button type="button" size="sm" variant="outline" onClick={()=>void portfolio.query.refetch()}>Retry</Button></WorkspaceNotice>}
      {inventory&&inventory.excludedUnclassifiedOrChanged>0&&<WorkspaceNotice tone="attention">{inventory.excludedUnclassifiedOrChanged} current terms have changed or unknown ownership classification and are excluded from the inventory.</WorkspaceNotice>}
      {inventory&&inventory.byKind.length>0&&<div className="border border-border bg-card p-4 space-y-2"><h3 className="font-semibold">Accepted relationships by type</h3>{inventory.byKind.map(item=><div key={item.kind} className="flex justify-between gap-2 text-sm"><span className="capitalize">{item.kind}</span><span>{item.count}</span></div>)}</div>}
      <div className="flex flex-wrap gap-2" aria-label="Relationship direction">
        <Button type="button" variant={direction==="outgoing"?"default":"outline"} aria-pressed={direction==="outgoing"} disabled={busy}
          onClick={()=>{setDirection("outgoing");setRequestAfter(undefined);}}>Outgoing</Button>
        <Button type="button" variant={direction==="incoming"?"default":"outline"} aria-pressed={direction==="incoming"} disabled={busy}
          onClick={()=>{setDirection("incoming");setRequestAfter(undefined);}}>Incoming</Button>
      </div>
      {error&&<WorkspaceNotice tone="danger">Some relationship information could not be loaded. No permissions have been inferred.</WorkspaceNotice>}
      {direction==="outgoing"&&<section aria-label="Choose activity and partner" className="space-y-4 border border-border bg-card p-5">
        <Field label="Tag at this level">
          <Select disabled={busy} value={kind} onChange={event=>{
            setKind(event.target.value as Kind);setScopeId("");setScopeAfter(undefined);
          }}>
            {relationshipScopeKinds.map(value=><option key={value} value={value}>{value[0]!.toUpperCase()+value.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Activity to share">
          <Select value={scopeId} disabled={busy||scopes.query.isFetching||scopes.query.isError} onChange={event=>setScopeId(event.target.value)}>
            <option value="">Choose an activity</option>
            {(scopes.data?.items??[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {scopeAfter&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setScopeAfter(undefined);setScopeId("");}}>First activities</Button>}
          {scopes.data?.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setScopeAfter(scopes.data?.next??undefined);setScopeId("");}}>More activities</Button>}
        </div>
        {selectedScope&&<ContextualReportingRelationships scopeKind={kind} scopeId={selectedScope.id} onChanged={async()=>{await Promise.all([requests.query.refetch({throwOnError:true}),portfolio.query.refetch({throwOnError:true})]);}}/>}
      </section>}
      {requests.query.isFetching?<p role="status">Loading relationship requests...</p>:
      requests.data&&<ReportingRelationshipPanel
        scope={{scopeKind:kind,scopeId:""}} entries={requests.data.items}
        recipients={[]} metrics={[]} canPropose={false}
        busy={busy} onPropose={()=>{}} onAction={decide}/>}
      <div className="flex flex-wrap gap-2">
        {requestAfter&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRequestAfter(undefined)}>First requests</Button>}
        {requests.data?.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRequestAfter(requests.data?.next??undefined)}>More requests</Button>}
      </div>
      <MutationFeedback state={feedback} pendingMessage="Updating relationship..."/>
      {feedback.refreshFailed&&<Button type="button" variant="outline" disabled={feedback.pending} onClick={()=>void feedback.retryRefresh()}>Retry refresh</Button>}
    </div>
  </WorkspaceShell>;
}
