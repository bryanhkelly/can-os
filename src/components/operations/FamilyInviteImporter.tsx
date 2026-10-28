import { useMemo, useState } from "react";
import { parseFamilyContacts } from "@/domain/family-contact-import";

export function FamilyInviteImporter({schoolName}:{schoolName:string}) {
  const [raw,setRaw]=useState("");
  const [subject,setSubject]=useState(`${schoolName} is welcoming families`);
  const [intro,setIntro]=useState("We're excited to invite your family to learn about our school.");
  const [sender,setSender]=useState("");
  const [replyTo,setReplyTo]=useState("");
  const [preview,setPreview]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const parsed=useMemo(()=>parseFamilyContacts(raw),[raw]);
  async function loadFile(file:File|undefined){
    if(!file)return;
    if(file.size>1024*1024){setRaw("");return;}
    setRaw(await file.text());setPreview(false);setConfirmed(false);
  }
  return <section className="mt-7 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Invite families">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Family outreach · Preparation</p>
    <h2 className="mt-2 font-serif text-2xl">Invite families</h2>
    <p className="mt-2 text-sm text-muted-foreground">Paste email addresses or upload a CSV file. Review contacts and the invitation before sending. This screen does not send email yet.</p>
    <label className="mt-5 block text-sm font-semibold">Paste families
      <textarea value={raw} onChange={event=>{setRaw(event.target.value);setPreview(false);setConfirmed(false);}}
        rows={7} placeholder={"john@example.com\nMary Jones <mary@example.com>\nJane Smith,jane@example.com"}
        className="mt-2 w-full rounded-xl border bg-background p-3 font-normal"/>
    </label>
    <label className="mt-4 block text-sm font-semibold">Or upload CSV / text (up to 1 MB)
      <input type="file" accept=".csv,.txt,text/csv,text/plain" className="mt-2 block w-full text-sm font-normal"
        onChange={event=>void loadFile(event.target.files?.[0])}/>
    </label>
    <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-live="polite">
      <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{parsed.contacts.length}</strong>Valid contacts</p>
      <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{parsed.duplicates}</strong>Duplicates removed</p>
      <p className="rounded-lg border p-3 text-sm"><strong className="block text-2xl">{parsed.issues.length-parsed.duplicates}</strong>Need attention</p>
    </div>
    {parsed.issues.length>0&&<details className="mt-4 rounded-lg border p-3" open><summary className="cursor-pointer text-sm font-semibold">Review skipped rows</summary>
      <ul className="mt-3 space-y-2">{parsed.issues.map(issue=><li key={issue.line} className="break-words text-sm">Line {issue.line}: {issue.reason} — {issue.raw}</li>)}</ul>
      <p className="mt-2 text-xs text-muted-foreground">Correct these entries in the paste area or CSV and review again. Valid contacts are retained.</p>
    </details>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Subject<input value={subject} maxLength={120} onChange={event=>setSubject(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3 font-normal"/></label>
      <label className="text-sm font-semibold">Sender display name<input value={sender} onChange={event=>setSender(event.target.value)} placeholder="Your church school" className="mt-2 w-full rounded-lg border bg-background p-3 font-normal"/></label>
      <label className="text-sm font-semibold sm:col-span-2">Personal introduction<textarea rows={3} value={intro} onChange={event=>setIntro(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3 font-normal"/></label>
      <label className="text-sm font-semibold sm:col-span-2">Reply-to email<input type="email" value={replyTo} onChange={event=>setReplyTo(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3 font-normal"/></label>
    </div>
    <button type="button" disabled={!parsed.contacts.length||!subject.trim()} onClick={()=>{setPreview(true);setConfirmed(false);}}
      className="mt-5 min-h-11 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Preview invitation</button>
    {preview&&<div className="mt-6 rounded-xl border p-5" aria-label="Invitation preview">
      <h3 className="font-semibold">Invitation preview · {parsed.contacts.length} families</h3>
      <p className="mt-3 text-xs text-muted-foreground">From: {sender||"Sender not set"} {replyTo&&`· Reply to: ${replyTo}`}</p>
      <p className="mt-2 font-semibold">{subject}</p>
      <p className="mt-4 whitespace-pre-wrap text-sm">{intro}</p>
      <p className="mt-3 text-sm">Learn more about {schoolName} and apply through the school's public page when published.</p>
      <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I have reviewed the recipients and invitation. Sending will require a separate authorized action.</label>
      <p className="mt-3 text-xs text-muted-foreground">{confirmed?"Preview confirmed. Sending is not yet connected to the authorized outreach service.":"No email has been sent."}</p>
    </div>}
  </section>;
}
