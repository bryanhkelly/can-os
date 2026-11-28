import {useState} from "react";
import {useWorkspaceSession} from "@/components/shell/WorkspaceSession";
import {usePrivateReportQuery,usePrivateReportScope} from "@/hooks/use-private-report-query";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {WorkspaceNotice} from "@/components/workspace/notice";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Field} from "@/components/ui/field";
import {ReportingRelationshipPanel} from "./ReportingRelationshipPanel";
import type {RelationshipProposal,RelationshipAction} from "@/domain/bottom-up-reporting-relationships";
import {getRelationshipRequests,findRelationshipRecipients,requestReportingRelationship,decideRelationshipRequest} from "@/modules/reporting/bottom-up-reporting-relationships.functions";

type Scope=Pick<RelationshipProposal,"scopeKind"|"scopeId">;
/** Mount beside a resource already selected by its authoritative workspace.
 * The server re-resolves ownership and exact active membership on every read
 * and mutation; this presentation filter is not a grant. */
export function ContextualReportingRelationships({scopeKind,scopeId}:Scope){
  const {session}=useWorkspaceSession();
  const privateScope=usePrivateReportScope();
  if(!privateScope||!session?.authenticated)return null;
  const grant=session.grants.find(g=>g.id===session.activeGrantId);
  const manager=session.role==="reporting_relationship_manager";
  const initiator=["site_admin","registrar"].includes(session.role)&&!!grant?.siteId&&
    ["site","program","class"].includes(scopeKind);
  if(!manager&&!initiator)return null;
  return <ContextualRelationshipContent key={privateScope+":"+scopeKind+":"+scopeId}
    privateScope={privateScope} scope={{scopeKind,scopeId}}/>;
}
function ContextualRelationshipContent({scope,privateScope}:{scope:Scope;privateScope:string}){
  const [after,setAfter]=useState<string|undefined>();
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [recipientAfter,setRecipientAfter]=useState<string|undefined>();
  const [formVersion,setFormVersion]=useState(0);
  const entries=usePrivateReportQuery({scope:privateScope,key:["relationships","outgoing",scope.scopeKind,scope.scopeId,after??null],
    read:()=>getRelationshipRequests({data:{direction:"outgoing",scope,after}})});
  const recipients=usePrivateReportQuery({scope:privateScope,key:["relationship-recipients",query,recipientAfter??null],
    enabled:query.length>=2,read:()=>findRelationshipRecipients({data:{query,after:recipientAfter}})});
  const feedback=useMutationFeedback(async()=>{await entries.query.refetch({throwOnError:true});});
  const busy=feedback.pending||feedback.refreshFailed||entries.query.isFetching;
  async function propose(proposal:RelationshipProposal){
    const result=await feedback.run(()=>requestReportingRelationship({data:proposal}),{
      successMessage:"Relationship request submitted.",commandErrorMessage:"Unable to submit this relationship."});
    if(result.status==="saved")setFormVersion(v=>v+1);
  }
  function decide(agreementId:string,action:RelationshipAction){
    void feedback.run(()=>decideRelationshipRequest({data:{agreementId,action}}),{
      successMessage:"Relationship decision recorded.",commandErrorMessage:"Unable to record the decision."});
  }
  if(entries.query.isError)return <WorkspaceNotice tone="attention">Relationships are unavailable for this membership or resource. <Button type="button" variant="outline" size="sm" onClick={()=>void entries.query.refetch()}>Retry</Button></WorkspaceNotice>;
  if(!entries.data)return <p role="status" className="text-sm text-muted-foreground">Loading relationships…</p>;
  return <section className="space-y-3" aria-label="Manage resource relationships">
    {!entries.data.canAuthorize&&<WorkspaceNotice>Tag organizations at this resource. Only an authorized relationship manager can propose reporting permissions.</WorkspaceNotice>}
    <form className="space-y-2" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setRecipientAfter(undefined);}}>
      <Field label="Find a partner organization">
        <Input value={search} maxLength={80} onChange={event=>setSearch(event.target.value)} disabled={busy}/>
      </Field>
      <Button type="submit" variant="outline" disabled={busy||search.trim().length<2}>Search organizations</Button>
    </form>
    {recipients.query.isFetching&&<p role="status" className="text-sm">Searching organizations…</p>}
    {recipients.query.isError&&<WorkspaceNotice tone="danger">Organization search is unavailable.</WorkspaceNotice>}
    {recipients.data&&!recipients.data.items.length&&<p className="text-sm text-muted-foreground">No eligible organizations on this page.</p>}
    <div className="flex flex-wrap gap-2">
      {recipientAfter&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRecipientAfter(undefined)}>First matches</Button>}
      {recipients.data?.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setRecipientAfter(recipients.data?.next??undefined)}>More matches</Button>}
    </div>
    <ReportingRelationshipPanel key={formVersion} scope={scope} entries={entries.data.items}
      recipients={recipients.data?.items??[]} metrics={entries.data.metrics} canPropose
      busy={busy} onPropose={proposal=>void propose(proposal)} onAction={decide}/>
    <div className="flex flex-wrap gap-2">
      {after&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setAfter(undefined)}>First relationships</Button>}
      {entries.data.next&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setAfter(entries.data?.next??undefined)}>More relationships</Button>}
    </div>
    <MutationFeedback state={feedback} pendingMessage="Updating relationship…"/>
    {feedback.refreshFailed&&<Button type="button" variant="outline" disabled={feedback.pending} onClick={()=>void feedback.retryRefresh()}>Retry refresh</Button>}
  </section>;
}
