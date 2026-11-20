import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { getOperationsActions } from "@/modules/operations/action-workspace.functions";

type ActionData = Awaited<ReturnType<typeof getOperationsActions>>;
export type OperationsActionItem = ActionData["items"][number];
type Assignee = ActionData["assignees"][number];

export type OperationsActionScope = { siteId?:string; programId?:string; action?:string };

/** Controlled action card used in Site and network operations views.
 * The owner manages due-date drafts, command feedback, and institutional
 * approval. The server continues to enforce all write authorization.
 */
export function OperationsActionCard({
  i, selected, assignees, commandsBlocked, dueDraft, hasDueDraft,
  onAssign, onDueChange, onSaveDue, onChangeStatus, onCompleteEnrollmentExit,
}: {
  i: OperationsActionItem;
  selected: OperationsActionScope;
  assignees: readonly Assignee[];
  commandsBlocked: boolean;
  dueDraft: string;
  hasDueDraft: boolean;
  onAssign: (id: string, personId: string | null, priority: "normal" | "high" | "urgent") => void | Promise<unknown>;
  onDueChange: (id: string, value: string) => void;
  onSaveDue: (id: string, value: string) => void;
  onChangeStatus: (id: string, status: "in_progress" | "waiting" | "resolved") => void;
  onCompleteEnrollmentExit: (id: string, kind: "withdrawal" | "transfer") => void;
}) {
  return <article className=" border bg-card p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold"><Link to="/home" search={{siteId:selected.siteId,programId:selected.programId,action:i.id}} className="hover:underline">{i.title}</Link></h3><StatusBadge tone={i.priority==="critical"?"danger":i.priority==="high"?"attention":"neutral"}>{i.priority}</StatusBadge></div><p className="mt-2 text-sm text-muted-foreground">{i.detail}</p>
  <p className="mt-2 text-xs text-muted-foreground">Status: {i.status?.replaceAll("_"," ") ?? "open"}
   {i.dueAt&&<> · Due {new Date(i.dueAt).toLocaleDateString()}
    {new Date(i.dueAt).getTime()<Date.now()&&<strong className="ml-2 text-foreground">Overdue</strong>}</>}
   {!i.ownerPersonId&&" · Unassigned"}
  </p>
  <div className="mt-3 flex flex-wrap gap-3">{i.type==="section_creation_request"?i.programId?
   <Link to="/launch/school/$programId" params={{programId:i.programId}} className="text-sm underline">Review teacher class request in academic setup →</Link>:
   <WorkspaceNotice tone="danger">This class request is missing its program. Contact your school administrator.</WorkspaceNotice>:
   i.openingHandoff&&i.siteId?<Link to="/sites/$siteId" params={{siteId:i.siteId}} className="text-sm underline">Named-recipient acknowledgment in Site Today →</Link>:i.managedBySupport?<p className="text-xs text-muted-foreground">Managed by the support team in their authorized referral workspace.</p>:<><Label className="flex items-center gap-2 text-xs">Assigned to
 <Select aria-label={"Assign "+i.title} className="min-w-0" disabled={commandsBlocked} value={i.ownerPersonId??""} onChange={event=>void onAssign(i.id,event.target.value||null,i.priority==="critical"?"urgent":i.priority==="high"?"high":"normal")}>
 <option value="" disabled={i.type==="onsite_coverage_gap"&&!!i.eligibleOwnerPersonId}>Unassigned</option>
 {i.type==="onsite_coverage_gap"&&i.ownerPersonId&&i.ownerPersonId!==i.eligibleOwnerPersonId&&
  <option value={i.ownerPersonId} disabled>Previous assignee — reassign to the current director</option>}
 {assignees.filter(person=>person.siteId===i.siteId&&
   (i.type==="onsite_coverage_gap"?person.role==="site_leader"&&person.id===i.eligibleOwnerPersonId:person.role!=="site_leader")).map(person=><option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.role}</option>)}
 </Select></Label>
 <Label className="flex flex-col gap-1 text-xs">Due date (your local time)
  <Input type="datetime-local" aria-label={"Deadline for "+i.title}
   className="min-w-0"
   disabled={commandsBlocked}
   value={dueDraft}
   onChange={event=>onDueChange(i.id,event.target.value)}/>
 </Label>
 <Button variant="outline" type="button" size="sm"
   disabled={commandsBlocked||!hasDueDraft}
   onClick={()=>onSaveDue(i.id,dueDraft)}>Save due date</Button>
 <Button variant="outline" type="button" size="sm" disabled={commandsBlocked} onClick={()=>onChangeStatus(i.id,"in_progress")}>Start</Button>
 <Button variant="outline" type="button" size="sm" disabled={commandsBlocked} onClick={()=>onChangeStatus(i.id,"waiting")}>Waiting</Button>
 {i.type==="guardian_health_information_review"?
  <Link to="/operations/health-review" search={{action:i.id}}
    className=" border px-3 py-1 text-xs font-semibold">Review confidential family update</Link>:
  i.type==="transfer_academic_records_handoff"?
  <Link to="/operations/transfer-records" className=" border px-3 py-1 text-xs font-semibold">Complete verified records transfer →</Link>:
  (i.enrollmentChangeKind==="transfer"||i.enrollmentChangeKind==="withdrawal")?
  <Button variant="outline" type="button" size="sm"
    disabled={commandsBlocked} onClick={()=>{if(i.enrollmentChangeKind==="withdrawal"||i.enrollmentChangeKind==="transfer")void onCompleteEnrollmentExit(i.id,i.enrollmentChangeKind);}}>
    Complete official {i.enrollmentChangeKind==="withdrawal"?"withdrawal":"transfer"} &amp; end school enrollment
  </Button>:
  i.type==="onsite_coverage_gap"&&i.siteId?
  <Link to="/sites/$siteId" params={{siteId:i.siteId}} className="text-xs underline">Assigned director resolves in Site Today →</Link>:
  <Button variant="outline" type="button" size="sm" disabled={commandsBlocked} onClick={()=>onChangeStatus(i.id,"resolved")}>Resolve</Button>}
 </>}</div></article>;
}
