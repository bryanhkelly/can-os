import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {WorkspaceShell} from "@/components/workspace";
import {WorkspaceNotice} from "@/components/workspace/notice";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {useWorkspaceSession} from "@/components/shell/WorkspaceSession";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {ReportingRelationshipPanel} from "@/components/reporting/ReportingRelationshipPanel";
import {relationshipScopeKinds,type RelationshipProposal,type RelationshipAction} from "@/domain/bottom-up-reporting-relationships";
import {
  getRelationshipRequests,getRelationshipScopes,findRelationshipRecipients,
  requestReportingRelationship,decideRelationshipRequest,
} from "@/modules/reporting/bottom-up-reporting-relationships.functions";

type Kind=RelationshipProposal["scopeKind"];
export function ReportingRelationshipsHome(){
  const {session}=useWorkspaceSession();
  if(!session?.authenticated||session.role!=="reporting_relationship_manager")
    return <WorkspaceShell title="Organization relationships"><WorkspaceNotice tone="danger">A direct relationship manager appointment is required.</WorkspaceNotice></WorkspaceShell>;
  return <RelationshipsWorkspace key={session.activeGrantId} grantId={session.activeGrantId??""}/>;
}
function RelationshipsWorkspace({grantId}:{grantId:string}){
  const [direction,setDirection]=useState<"outgoing"|"incoming">("outgoing");
  const [requestAfter,setRequestAfter]=useState<string|undefined>();
  const [kind,setKind]=useState<Kind>("organization");
  const [scopeId,setScopeId]=useState("");
  const [scopeAfter,setScopeAfter]=useState<string|undefined>();
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [recipientAfter,setRecipientAfter]=useState<string|undefined>();
  const requests=useQuery({queryKey:["reporting-relationships",grantId,direction,requestAfter],
    queryFn:()=>getRelationshipRequests({data:{direction,after:requestAfter}}),retry:false});
  const scopes=useQuery({queryKey:["relationship-scopes",grantId,kind,scopeAfter],
    queryFn:()=>getRelationshipScopes({data:{kind,after:scopeAfter}}),enabled:direction==="outgoing",retry:false});
  const recipients=useQuery({queryKey:["relationship-recipients",grantId,query,recipientAfter],
    queryFn:()=>findRelationshipRecipients({data:{query,after:recipientAfter}}),
    enabled:direction==="outgoing"&&query.length>=2,retry:false});
  const feedback=useMutationFeedback(async()=>{await requests.refetch({throwOnError:true});});
  const busy=feedback.pending||feedback.refreshFailed;
  const selectedScope=scopes.data?.items.find(item=>item.id===scopeId);
  const error=requests.isError||direction==="outgoing"&&(scopes.isError||recipients.isError);
  function propose(proposal:RelationshipProposal){
    void feedback.run(()=>requestReportingRelationship({data:proposal}),{
      successMessage:"Relationship request submitted for independent acceptance.",
      commandErrorMessage:"Unable to submit the relationship request.",
    });
  }
  function decide(agreementId:string,action:RelationshipAction){
    void feedback.run(()=>decideRelationshipRequest({data:{agreementId,action}}),{
      successMessage:"Relationship decision recorded.",
      commandErrorMessage:"Unable to record the relationship decision.",
    });
  }
  return <WorkspaceShell title="Organization relationships" subtitle="Choose the activity and aggregate metrics your organization is willing to share.">
    <div className="space-y-4">
      <WorkspaceNotice>Acceptance records consent only. Partner outcome reports remain unavailable until independently approved disclosure and reporting integration are complete.</WorkspaceNotice>
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
          <Select value={scopeId} disabled={busy||scopes.isFetching||scopes.isError} onChange={event=>setScopeId(event.target.value)}>
            <option value="">Choose an activity</option>
            {(scopes.data?.items??[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {scopeAfter&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setScopeAfter(undefined);setScopeId("");}}>First activities</Button>}
          {scopes.data?.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setScopeAfter(scopes.data?.next??undefined);setScopeId("");}}>More activities</Button>}
        </div>
        <form className="space-y-3" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setRecipientAfter(undefined);}}>
          <Field label="Find an organization" description="Search organizations with a registered relationship manager.">
            <Input value={search} disabled={busy} onChange={event=>setSearch(event.target.value)} maxLength={80}/>
          </Field>
          <Button type="submit" variant="outline" disabled={busy||search.trim().length<2}>Search organizations</Button>
        </form>
        {recipients.isFetching&&<p role="status" className="text-sm">Searching organizations...</p>}
        {query&&recipients.isSuccess&&!recipients.data.items.length&&<p className="text-sm text-muted-foreground">No eligible organizations matched.</p>}
        <div className="flex flex-wrap gap-2">
          {recipientAfter&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRecipientAfter(undefined)}>First matches</Button>}
          {recipients.data?.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRecipientAfter(recipients.data?.next??undefined)}>More matches</Button>}
        </div>
      </section>}
      {requests.isPending?<p role="status">Loading relationship requests...</p>:
      !requests.isError&&<ReportingRelationshipPanel
        scope={{scopeKind:kind,scopeId:scopeId||""}} entries={requests.data?.items??[]}
        recipients={recipients.isError||recipients.isFetching?[]:recipients.data?.items??[]}
        metrics={scopes.isError?[]:scopes.data?.metrics??[]}
        canPropose={direction==="outgoing"&&!!selectedScope&&!error}
        busy={busy||requests.isFetching} onPropose={propose} onAction={decide}/>}
      <div className="flex flex-wrap gap-2">
        {requestAfter&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRequestAfter(undefined)}>First requests</Button>}
        {requests.data?.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRequestAfter(requests.data?.next??undefined)}>More requests</Button>}
      </div>
      <MutationFeedback state={feedback} pendingMessage="Updating relationship..."/>
    </div>
  </WorkspaceShell>;
}
