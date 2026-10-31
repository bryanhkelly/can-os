import type {FormEvent} from "react";
export interface FamilyInvitationDraft { programId:string;contacts:string;subject:string;introduction:string }
export function FamilyInvitationForm({programs,draft,busy,onChange,onSubmit}:{
 programs:readonly {id:string;name:string}[];draft:FamilyInvitationDraft;busy:boolean;
 onChange:(patch:Partial<FamilyInvitationDraft>)=>void;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;
}) {
 if(!programs.length)return <p className="mt-6 rounded border p-4 text-sm">No operating school Programs with admissions authority are available to this registrar. Complete institutional authorization before sending application invitations.</p>;
 return <form onSubmit={onSubmit} className="mt-6 max-w-3xl space-y-4 rounded-xl border bg-card p-5">
  <h2 className="font-semibold">Send a private receiving-school application invitation</h2>
  <label className="block text-sm font-medium">Authorized school Program
   <select required value={draft.programId} onChange={e=>onChange({programId:e.target.value})} className="mt-2 w-full rounded border bg-background p-3">{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
  </label>
  <label className="block text-sm font-medium">Family contacts · one per line
   <textarea required rows={5} maxLength={20000} value={draft.contacts} onChange={e=>onChange({contacts:e.target.value})} placeholder="Guardian Name,guardian@example.com" className="mt-2 w-full rounded border bg-background p-3"/>
  </label>
  <p className="text-xs text-muted-foreground">Only include adults who have requested or consented to contact. Do not paste child data, medical records or custody documents. The existing invitation service deduplicates recipients and checks school authorization.</p>
  <label className="block text-sm font-medium">Email subject
   <input required minLength={3} maxLength={120} value={draft.subject} onChange={e=>onChange({subject:e.target.value})} className="mt-2 w-full rounded border bg-background p-3"/>
  </label>
  <label className="block text-sm font-medium">School introduction
   <textarea required rows={3} maxLength={2000} value={draft.introduction} onChange={e=>onChange({introduction:e.target.value})} className="mt-2 w-full rounded border bg-background p-3"/>
  </label>
  <button type="submit" disabled={busy||!draft.contacts.trim()||!draft.programId||!draft.subject.trim()||!draft.introduction.trim()} className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">{busy?"Queuing…":"Queue secure invitations"}</button>
 </form>;
}
