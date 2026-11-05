import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
export interface FamilyInvitationDraft { programId:string;contacts:string;subject:string;introduction:string }
export function FamilyInvitationForm({programs,draft,busy,onChange,onSubmit}:{
 programs:readonly {id:string;name:string}[];draft:FamilyInvitationDraft;busy:boolean;
 onChange:(patch:Partial<FamilyInvitationDraft>)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
}) {
 const [attempted,setAttempted]=useState(false);
 const errors={
    program:attempted&&!draft.programId?"Choose a school Program.":undefined,
    contacts:attempted&&!draft.contacts.trim()?"Enter at least one family contact.":undefined,
    subject:attempted&&draft.subject.trim().length<3?"Enter a subject with at least 3 characters.":undefined,
    introduction:attempted&&!draft.introduction.trim()?"Enter a school introduction.":undefined,
 };
 function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if(Object.values(errors).some(Boolean))return;
   setAttempted(false);
    onSubmit(event);
 }
 if(!programs.length)return <p className="mt-6 rounded border p-4 text-sm">No operating school Programs with admissions authority are available to this registrar. Complete institutional authorization before sending application invitations.</p>;
 return <form noValidate onSubmit={submit} className="mt-6 max-w-3xl space-y-4 rounded-xl border bg-card p-5">
  <h2 className="font-semibold">Send a private receiving-school application invitation</h2>
    <Field label="Authorized school Program" required error={errors.program}>
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
    <Button type="submit" disabled={busy}>{busy?"Queuing…":"Queue secure invitations"}</Button>
 </form>;
}
