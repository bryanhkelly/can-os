import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Checkbox} from "@/components/ui/choice";
import {Label} from "@/components/ui/label";
import {ActionFooter} from "@/components/workspace/action-footer";
import {EmptyState} from "@/components/workspace/empty-state";
import {StatusBadge} from "@/components/workspace/workspace-panel";
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
  inherited?:boolean;
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
  const [coverageMode,setCoverageMode]=useState<"prospective"|"from_date"|"all_history">("prospective");
  const [coverageDate,setCoverageDate]=useState("");
  const [expiryDate,setExpiryDate]=useState("");
  const [supersedesId,setSupersedesId]=useState<string|null>(null);
  const [confirm,setConfirm]=useState<{id:string;action:RelationshipAction}|null>(null);
  const availableMetrics=metrics.filter(m=>selected.includes(m.metricKey+":"+m.definitionVersion));
  const currentRecipient=recipients.some(r=>r.id===recipient)||!!supersedesId&&entries.some(e=>e.agreement.id===supersedesId&&e.agreement.recipientOrganizationId===recipient&&e.agreement.status==="accepted");
  const today=new Date().toISOString().slice(0,10);
  const coverageValid=selected.length===0||coverageMode!=="from_date"||!!coverageDate&&coverageDate<=today;
  const expiryValid=!expiryDate||expiryDate>today;
  const canSubmit=canPropose&&!busy&&currentRecipient&&coverageValid&&expiryValid&&availableMetrics.length===selected.length;
  function amend(entry:RelationshipPanelEntry){
    const a=entry.agreement;
    setSupersedesId(a.id);setRecipient(a.recipientOrganizationId);setKind(a.relationshipKind);
    setSelected(a.metrics.map(m=>m.metricKey+":"+m.definitionVersion));
    setCoverageMode(a.coverageMode??"prospective");setCoverageDate(a.coverageFrom?.slice(0,10)??"");setExpiryDate(a.validThrough?.slice(0,10)??"");
  }
  function clearAmendment(){setSupersedesId(null);setRecipient("");setKind("affiliation");setSelected([]);setCoverageMode("prospective");setCoverageDate("");setExpiryDate("");}
  return <section aria-label="Reporting relationships" className="space-y-4 border border-border bg-card p-5">
    <div className="space-y-1">
      <h3 className="text-base font-semibold">Organization relationships</h3>
      <p className="text-sm text-muted-foreground">Tag organizations and agree on aggregate reporting metrics. Acceptance records consent; report release requires separate disclosure checks.</p>
    </div>
    {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
    {entries.length===0?<EmptyState title="No relationships for this scope yet."/>:
      <ul className="space-y-3">{entries.map(entry=>{const {agreement,organizationName,scopeName,metricLabels,allowedActions,inherited}=entry;return <li key={agreement.id} className="space-y-2 border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{organizationName}</span>
            <StatusBadge tone={agreement.status==="accepted"?"success":agreement.status==="pending"?"attention":"neutral"}>{agreement.status}</StatusBadge>
          </div>
          <p className="text-sm">{relationshipLabels[agreement.relationshipKind]}</p>
          <p className="text-sm text-muted-foreground">Scope: {agreement.scopeKind}{scopeName?": "+scopeName:""}. Selected metrics: {metricLabels.join(", ")||"None — relationship only"}.</p>
          {inherited&&<p className="text-sm text-muted-foreground">Inherited from {agreement.scopeKind}; manage at the source.</p>}
          {agreement.metrics.length>0&&<p className="text-sm text-muted-foreground">Reporting coverage: {agreement.coverageMode==="all_history"?"All eligible history":agreement.coverageMode==="from_date"?"From "+agreement.coverageFrom?.slice(0,10)+" (UTC)":"From acceptance"}.</p>}
          {agreement.supersedesId&&<p className="text-sm text-muted-foreground">Amendment to prior terms.</p>}
          {agreement.validThrough&&<p className="text-sm text-muted-foreground">Ends {agreement.validThrough.slice(0,10)} (UTC).</p>}
          <div className="flex flex-wrap gap-2">{allowedActions.map(action=><Button key={action} type="button"
            variant="outline" disabled={busy} onClick={()=>setConfirm({id:agreement.id,action})}>{actionLabels[action]}</Button>)}</div>
          {canPropose&&agreement.status==="accepted"&&agreement.scopeKind===scope.scopeKind&&agreement.scopeId===scope.scopeId&&allowedActions.includes("revoke")&&<Button type="button" variant="outline" disabled={busy} onClick={()=>amend(entry)}>Amend terms</Button>}
          {confirm?.id===agreement.id&&allowedActions.includes(confirm.action)&&<div className="space-y-2">
            <WorkspaceNotice tone="attention">{confirm.action==="accept"?"Accept these exact sharing terms?":confirm.action==="revoke"?"Revoke future reporting access? Previously released reports are not recalled.":"Confirm this relationship decision?"}</WorkspaceNotice>
            <ActionFooter layout="inline">
              <Button type="button" disabled={busy} onClick={()=>{onAction(confirm.id,confirm.action);setConfirm(null);}}>Confirm</Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button>
            </ActionFooter>
          </div>}
        </li>})}</ul>}
    {canPropose&&<form className="space-y-4 border-t border-border pt-4" onSubmit={event=>{
      event.preventDefault();
      if(!canSubmit)return;
      const sharing=availableMetrics.length>0;
      onPropose({...scope,recipientOrganizationId:recipient,relationshipKind:kind,
        metrics:availableMetrics.map(({metricKey,definitionVersion})=>({metricKey,definitionVersion})),
        coverageMode:sharing?coverageMode:"prospective",coverageFrom:sharing&&coverageMode==="from_date"?coverageDate+"T00:00:00.000Z":null,
        validThrough:expiryDate?expiryDate+"T00:00:00.000Z":null,supersedesId});
    }}>
      {supersedesId&&<div className="space-y-2"><WorkspaceNotice tone="attention">Amending accepted terms. Existing permission remains unchanged until the recipient accepts the replacement.</WorkspaceNotice><Button type="button" variant="outline" disabled={busy} onClick={clearAmendment}>Cancel amendment</Button></div>}
      <Field label="Organization" required>
        <Select value={recipient} disabled={busy||!!supersedesId} onChange={e=>setRecipient(e.target.value)}>
          <option value="">Choose an organization</option>
          {supersedesId&&!recipients.some(r=>r.id===recipient)&&<option value={recipient}>{entries.find(e=>e.agreement.id===supersedesId)?.organizationName}</option>}
          {recipients.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Relationship" required>
        <Select value={kind} disabled={busy||!!supersedesId} onChange={e=>setKind(e.target.value as typeof kind)}>
          {Object.entries(relationshipLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Aggregate reporting metrics</legend>
        {metrics.length===0?<p className="text-sm text-muted-foreground">No reporting permissions can be selected from this workspace.</p>:metrics.map(m=>{
          const key=m.metricKey+":"+m.definitionVersion;
          return <Label key={key} className="flex items-center gap-3">
            <Checkbox checked={selected.includes(key)} onChange={e=>setSelected(old=>e.target.checked?[...old,key]:old.filter(v=>v!==key))}/>
            {m.label}
          </Label>;
        })}
      </fieldset>
      <p className="text-sm text-muted-foreground">Selecting no metrics creates a relationship without permission to use your numbers.</p>
      {availableMetrics.length>0&&<>
        <Field label="Reporting coverage">
          <Select value={coverageMode} disabled={busy} onChange={e=>setCoverageMode(e.target.value as typeof coverageMode)}>
            <option value="prospective">Activity after acceptance</option>
            <option value="from_date">Activity from a specified date</option>
            <option value="all_history">All eligible historical and future activity</option>
          </Select>
        </Field>
        {coverageMode==="from_date"&&<Field label="Reporting start date (UTC)" required><Input type="date" max={today} value={coverageDate} disabled={busy} onChange={e=>setCoverageDate(e.target.value)}/></Field>}
        {coverageMode!=="prospective"&&<WorkspaceNotice tone="attention">Historical activity is included only within these explicitly accepted reporting terms.</WorkspaceNotice>}
      </>}
      <Field label="Permission expires (optional, UTC)"><Input type="date" min={today} value={expiryDate} disabled={busy} onChange={e=>setExpiryDate(e.target.value)}/></Field>
      <ActionFooter layout="form"><Button type="submit" disabled={!canSubmit} loading={busy} loadingLabel="Working…">{supersedesId?"Request amendment":"Request relationship"}</Button></ActionFooter>
    </form>}
  </section>;
}
