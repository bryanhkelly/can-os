import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ActionFooter, WorkspacePanel } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
export interface FamilyInvitationDraft { programId:string;contacts:string;subject:string;introduction:string }

/** Validate the current draft, not React's previous attempted state.
 * The Program must be one of the current authorized Site/purpose options.
 * The server independently verifies every send request.
 */
export function familyInvitationDraftIssues(
  draft:FamilyInvitationDraft, programs:readonly {id:string}[],
) {
  return {
    program:!programs.some(program=>program.id===draft.programId)
      ? "Choose an eligible Program.":undefined,
    contacts:!draft.contacts.trim()?"Enter at least one family contact.":undefined,
    subject:draft.subject.trim().length<3
      ? "Enter a subject with at least 3 characters.":undefined,
    introduction:!draft.introduction.trim()?"Enter a school introduction.":undefined,
  };
}
export function FamilyInvitationForm({programs,draft,busy,onChange,onSubmit,purpose="application"}:{
 programs:readonly {id:string;name:string}[];draft:FamilyInvitationDraft;busy:boolean;
 purpose?:"interest"|"application";
 onChange:(patch:Partial<FamilyInvitationDraft>)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
}) {
 const [attempted,setAttempted]=useState(false);
 const issues=familyInvitationDraftIssues(draft,programs);
 const errors=attempted?issues:{program:undefined,contacts:undefined,subject:undefined,introduction:undefined};
 function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    // The first submit must not slip past validation while attempted is false.
    if(busy||Object.values(issues).some(Boolean))return;
    setAttempted(false);
    onSubmit(event);
 }
 if(!programs.length)return <p className="mt-6 border p-4 text-sm">{purpose==="interest"
   ? "No eligible developing school Programs are available for interest outreach at this Site. Creating a Site alone does not authorize invitations."
   : "No operating school Programs with admissions authority are available to this registrar. Complete institutional authorization before sending application invitations."}</p>;
 return <WorkspacePanel className="mt-6 max-w-3xl" title={purpose==="interest"
    ? "Invite consenting adults to express interest" : "Send a private receiving-school application invitation"}>
  <form noValidate onSubmit={submit} className="space-y-4">
    <Field label={purpose==="interest"?"Eligible developing Program":"Authorized school Program"} required error={errors.program}>
     <Select value={draft.programId} onChange={e=>onChange({programId:e.target.value})}>
        <option value="">Choose a Program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </Select>
    </Field>
    <Field label="Family contacts · one per line" required error={errors.contacts}>
     <Textarea rows={5} maxLength={20000} value={draft.contacts} onChange={e=>onChange({contacts:e.target.value})}
        placeholder="Guardian Name,guardian@example.com"/>
    </Field>
  <p className="text-xs text-muted-foreground">Only include adults who have requested or consented to contact. Do not paste child data, medical records or custody documents. The existing invitation service deduplicates recipients and checks school authorization.</p>
    <Field label="Email subject" required error={errors.subject}>
     <Input minLength={3} maxLength={120} value={draft.subject} onChange={e=>onChange({subject:e.target.value})}/>
    </Field>
    <Field label="School introduction" required error={errors.introduction}>
     <Textarea rows={3} maxLength={2000} value={draft.introduction} onChange={e=>onChange({introduction:e.target.value})}/>
    </Field>
    <ActionFooter layout="form">
      <Button type="submit" disabled={busy} loading={busy} loadingLabel="Queuing invitations...">Queue secure invitations</Button>
    </ActionFooter>
  </form>
 </WorkspacePanel>;
}
