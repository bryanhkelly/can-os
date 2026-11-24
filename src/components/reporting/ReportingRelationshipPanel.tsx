import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {Checkbox} from "@/components/ui/choice";
import {Label} from "@/components/ui/label";
import {WorkspaceNotice} from "@/components/workspace/notice";
import type {RelationshipAction,RelationshipMetric,RelationshipProposal,ReportingRelationship} from "@/domain/bottom-up-reporting-relationships";

const relationshipLabels={
  affiliation:"Affiliated with",sponsorship:"Sponsored by",funding:"Funded by",
  provider:"Provided by",host:"Hosted by",accreditation:"Accredited by",
  endorsement:"Endorsed by",operator:"Operated by",partnership:"In partnership with",
} satisfies Record<RelationshipProposal["relationshipKind"],string>;
const actionLabels={
  accept:"Accept relationship",decline:"Decline",withdraw:"Withdraw",revoke:"Revoke access",
} satisfies Record<RelationshipAction,string>;
export type RelationshipPanelEntry={
  agreement:Omit<ReportingRelationship,"proposedByPersonId"|"acceptedByPersonId">;
  scopeName?:string;
  organizationName:string;
  metricLabels:readonly string[];
  allowedActions:readonly RelationshipAction[];
};
export type ReportingRelationshipPanelProps={
  scope:Pick<RelationshipProposal,"scopeKind"|"scopeId">;
  entries:readonly RelationshipPanelEntry[];
  recipients:readonly {id:string;name:string}[];
  metrics:readonly (RelationshipMetric&{label:string})[];
  canPropose:boolean;
  busy?:boolean;
  error?:string;
  onPropose:(proposal:RelationshipProposal)=>void;
  onAction:(id:string,action:RelationshipAction)=>void;
};

/** One V6.1 composition for Organization, Site, Program, Offering and Class.
 * Parent workspace owns authorized data, mutation feedback and refresh.
 * Displayed actions are UX hints, never permission checks. */
export function ReportingRelationshipPanel(props:ReportingRelationshipPanelProps){
  // Changing resource context must not carry a pending draft into another scope.
  return <RelationshipPanelContent key={props.scope.scopeKind+":"+props.scope.scopeId} {...props}/>;
}
function RelationshipPanelContent({scope,entries,recipients,metrics,canPropose,busy=false,error,onPropose,onAction}:ReportingRelationshipPanelProps){
  const [recipient,setRecipient]=useState("");
  const [kind,setKind]=useState<RelationshipProposal["relationshipKind"]>("affiliation");
  const [selected,setSelected]=useState<string[]>([]);
  const [confirm,setConfirm]=useState<{id:string;action:RelationshipAction}|null>(null);
  const availableMetrics=metrics.filter(m=>selected.includes(m.metricKey+":"+m.definitionVersion));
  const currentRecipient=recipients.some(r=>r.id===recipient);
  return <section aria-label="Reporting relationships" className="space-y-4 border border-border bg-card p-5">
    <div className="space-y-1">
      <h3 className="text-base font-semibold">Organization relationships</h3>
      <p className="text-sm text-muted-foreground">Tag organizations and agree on aggregate reporting metrics. Acceptance records consent; report release requires separate disclosure checks.</p>
    </div>
    {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    {entries.length===0?<p className="text-sm text-muted-foreground">No relationships for this scope yet.</p>:
      <ul className="space-y-3">{entries.map(({agreement,organizationName,scopeName,metricLabels,allowedActions})=>
        <li key={agreement.id} className="space-y-2 border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{organizationName}</span>
            <span className="text-sm capitalize text-muted-foreground">{agreement.status}</span>
          </div>
          <p className="text-sm">{relationshipLabels[agreement.relationshipKind]}</p>
          <p className="text-sm text-muted-foreground">Scope: {agreement.scopeKind}{scopeName?": "+scopeName:""}. Selected metrics: {metricLabels.join(", ")||"None"}.</p>
          {agreement.validThrough&&<p className="text-sm text-muted-foreground">Ends {agreement.validThrough.slice(0,10)} (UTC).</p>}
          <div className="flex flex-wrap gap-2">{allowedActions.map(action=><Button key={action} type="button"
            variant="outline" disabled={busy} onClick={()=>setConfirm({id:agreement.id,action})}>{actionLabels[action]}</Button>)}</div>
          {confirm?.id===agreement.id&&allowedActions.includes(confirm.action)&&<div className="space-y-2">
            <WorkspaceNotice tone="attention">{confirm.action==="accept"?"Accept these exact sharing terms?":confirm.action==="revoke"?"Revoke future reporting access? Previously released reports are not recalled.":"Confirm this relationship decision?"}</WorkspaceNotice>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={()=>{onAction(confirm.id,confirm.action);setConfirm(null);}}>Confirm</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button>
            </div>
          </div>}
        </li>)}</ul>}
    {canPropose&&<form className="space-y-4 border-t border-border pt-4" onSubmit={event=>{
      event.preventDefault();
      if(busy||!currentRecipient||availableMetrics.length===0)return;
      onPropose({...scope,recipientOrganizationId:recipient,relationshipKind:kind,
        metrics:availableMetrics.map(({metricKey,definitionVersion})=>({metricKey,definitionVersion})),validThrough:null});
    }}>
      <Field label="Organization" required>
        <Select value={recipient} disabled={busy} onChange={e=>setRecipient(e.target.value)}>
          <option value="">Choose an organization</option>
          {recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Relationship" required>
        <Select value={kind} disabled={busy} onChange={e=>setKind(e.target.value as typeof kind)}>
          {Object.entries(relationshipLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Aggregate reporting metrics</legend>
        {metrics.length===0?<p className="text-sm text-muted-foreground">No metrics are approved for sharing at this scope.</p>:metrics.map(m=>{
          const key=m.metricKey+":"+m.definitionVersion;
          return <Label key={key} className="flex items-center gap-3">
            <Checkbox checked={selected.includes(key)} onChange={e=>setSelected(old=>e.target.checked?[...old,key]:old.filter(v=>v!==key))}/>
            {m.label}
          </Label>;
        })}
      </fieldset>
      <p className="text-sm text-muted-foreground">This request covers future activity at this scope until revoked. It does not share historical activity.</p>
      <Button type="submit" disabled={busy||!currentRecipient||availableMetrics.length===0}>Request relationship</Button>
    </form>}
  </section>;
}
