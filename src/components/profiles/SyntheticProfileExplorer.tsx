import { useState } from "react";
import { credentialState, evaluatePersonRequirements } from "@/domain/profiles-compliance";
const people = [
 {name:"Sarah Mitchell",role:"Teacher",site:"High School Extension",school:"Baylor University",degree:"M.S. Biology",credentials:[{credentialType:"cpr",name:"CPR / AED",verificationStatus:"verified" as const,expiresAt:new Date("2027-06-15")},{credentialType:"teaching_license",name:"Teaching credential",verificationStatus:"verified" as const,expiresAt:new Date("2028-06-15")}]},
 {name:"Jordan Ellis",role:"Paraprofessional",site:"Learning Center",school:"Arizona State University",degree:"B.A. Education",credentials:[{credentialType:"cpr",name:"CPR / AED",verificationStatus:"pending" as const,expiresAt:new Date("2027-04-01")},{credentialType:"first_aid",name:"First aid",verificationStatus:"verified" as const,expiresAt:new Date("2027-04-01")}]},
 {name:"Morgan Lee",role:"Site Administrator",site:"Church-Hosted Academy",school:"Seattle University",degree:"M.Ed. Educational Leadership",credentials:[{credentialType:"cpr",name:"CPR / AED",verificationStatus:"verified" as const,expiresAt:new Date("2026-01-01")}]},
 {name:"Alex Rivera",role:"Student",site:"Grade 11",school:"CAN Academy",degree:"Secondary school student",credentials:[]},
] as const;
const asOf = new Date("2026-10-15T12:00:00Z");
export function SyntheticProfileExplorer(){
 const [selected,setSelected]=useState(0);
 const person=people[selected] ?? people[0]!;
 const required = person.role==="Student" ? [] : [{code:"Safety readiness",requiredCredentialTypes:["cpr"],mandatory:true}];
 const statuses=evaluatePersonRequirements(required,person.credentials.map(c=>({...c})),asOf);
 return <main className="mx-auto max-w-6xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic demonstration</p>
  <h1 className="mt-3 font-serif text-5xl">One person. Every role.</h1>
  <p className="mt-4 max-w-2xl text-sm text-muted-foreground">Explore how academic history, qualifications and site responsibility fit together. All information on this page is illustrative and not persisted. Credential verification is not available in this preview.</p>
  <div className="mt-8 grid gap-6 md:grid-cols-[260px_1fr]">
   <nav aria-label="Example profiles" className="space-y-2">{people.map((p,i)=><button key={p.name} type="button" onClick={()=>setSelected(i)} aria-current={selected===i?"page":undefined} className={`block w-full rounded-xl border p-4 text-left text-sm ${selected===i?"border-foreground bg-muted":"border-border bg-card"}`}><strong className="block">{p.name}</strong><span className="text-muted-foreground">{p.role}</span></button>)}</nav>
   <div className="rounded-2xl border bg-card p-6">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">{person.site}</p>
    <h2 className="mt-2 font-serif text-4xl">{person.name}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{person.role}</p>
    <div className="mt-7 grid gap-6 sm:grid-cols-2">
     <section><h3 className="font-semibold">Education</h3><p className="mt-2 text-sm">{person.degree}</p><p className="text-sm text-muted-foreground">{person.school}</p><p className="mt-2 text-xs text-muted-foreground">Self-reported demo record · Not independently verified</p></section>
     <section><h3 className="font-semibold">Readiness</h3>{statuses.length?statuses.map(s=><p key={s.code} className="mt-2 text-sm">{s.code}: <strong>{s.status}</strong>{s.blocking?" · Action required":""}</p>):<p className="mt-2 text-sm text-muted-foreground">No staff safety requirements apply in this preview.</p>}</section>
    </div>
    <section className="mt-7"><h3 className="font-semibold">Credentials and training</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{person.credentials.length?person.credentials.map(c=><div key={c.credentialType} className="rounded-lg border p-3"><p className="text-sm font-semibold">{c.name}</p><p className="mt-1 text-xs text-muted-foreground">Status: {credentialState(c,asOf)} · Expires {c.expiresAt.toISOString().slice(0,10)}</p></div>):<p className="text-sm text-muted-foreground">No credentials in synthetic profile.</p>}</div></section>
    <p className="mt-7 border-t pt-4 text-xs text-muted-foreground">Demo statuses are synthetic only. Actual readiness requires authenticated record access, documented verification and jurisdiction-specific policies.</p>
   </div>
  </div>
 </main>;
}
