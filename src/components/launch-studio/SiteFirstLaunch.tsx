import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Check, Globe2, GraduationCap, Monitor, Sparkles, Users } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SiteTimezoneField } from "@/components/workspace/SiteTimezoneField";
import { createLaunchSite, type listLaunchOptions } from "@/modules/programs/launch.functions";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { suggestedLaunchSlug } from "@/domain/launch-slug";
import { usStatesAndTerritories } from "@/domain/site-setup-configuration";
import { readSiteLaunchPreferences, saveSiteLaunchPreferences } from "@/modules/programs/site-launch-preferences.functions";

type Options = Awaited<ReturnType<typeof listLaunchOptions>>;
type Delivery = "physical" | "digital" | "both";
type Step = 0 | 1 | 2 | 3;
const interests = [
  { id: "grades-6-8", title: "Grades 6–8", detail: "Middle school curriculum", icon: GraduationCap },
  { id: "grades-9-12", title: "Grades 9–12", detail: "High school curriculum", icon: GraduationCap },
  { id: "afterschool", title: "Afterschool", detail: "Learning beyond the school day", icon: Users },
  { id: "weekend", title: "Weekend", detail: "Weekend learning", icon: Users },
  { id: "summer", title: "Summer / breaks", detail: "Seasonal learning", icon: Sparkles },
  { id: "evening", title: "Evening", detail: "Programs after work or school", icon: Monitor },
  { id: "adult", title: "Adult learning", detail: "Skills and community education", icon: Users },
  { id: "senior", title: "Senior programs", detail: "Learning for older adults", icon: Users },
] as const;
const steps = ["Your Site", "Network", "Program interests", "Website reveal"] as const;

/** A lightweight, explicitly private preview. No made-up Program or enrollment
 * release is created by choosing interests; publication remains server-owned. */
export function SiteFirstLaunch({options}:{options:Options}) {
  const [step,setStep] = useState<Step>(0);
  const [siteId,setSiteId] = useState("");
  const [name,setName] = useState("");
  const [organizationId,setOrganizationId] = useState("");
  const [city,setCity] = useState("");
  const [state,setState] = useState("");
  const [timezone,setTimezone] = useState("");
  const [delivery,setDelivery] = useState<Delivery>("both");
  const [networkCode,setNetworkCode] = useState("");
  const [networkChoice,setNetworkChoice] = useState<"independent"|"code">("independent");
  const [chosen,setChosen] = useState<string[]>([]);
  const [error,setError] = useState("");
  const [savingPreferences,setSavingPreferences] = useState(false);
  const siteMutation=useWorkspaceMutation({mutationFn:createLaunchSite});
  const known=options.sites.find(s=>s.id===siteId);
  const siteName=known?.name??name;
  const siteCity=known?.planningLocation?.city??city;
  const siteState=known?.planningLocation?.state??state;
  const previews=interests.filter(x=>chosen.includes(x.id));

  async function saveSite(e:FormEvent) {
    e.preventDefault();
    if(siteMutation.isSubmitting)return;
    setError("");
    if(siteId) {
      try {
        const preferences=await readSiteLaunchPreferences({data:{siteId}});
        if(preferences){setDelivery(preferences.delivery);setChosen(preferences.interestIds);}
        setStep(1);
      } catch(cause) {setError(mutationErrorMessage(cause,"Unable to read this Site’s saved launch preferences."));}
      return;
    }
    try {
      const saved=await siteMutation.submit({data:{
        organizationId,name,slug:suggestedLaunchSlug(name)||"learning-site",timezone,
        stubOnly:false,planningLocation:{city,state},
      }});
      if(saved.status==="ignored")return;
      setSiteId(saved.value.siteId);
      setStep(1);
    }catch(cause){setError(mutationErrorMessage(cause,"Unable to establish your Site. Nothing has been published."));}
  }

  const forward=()=>setStep(current=>Math.min(3,current+1) as Step);
  async function revealSite(){
    if(!siteId||savingPreferences)return;
    setSavingPreferences(true);setError("");
    try {
      await saveSiteLaunchPreferences({data:{siteId,preferences:{delivery,interestIds:chosen}}});
      setStep(3);
    }catch(cause){setError(mutationErrorMessage(cause,"Unable to save program interests. The Site remains private."));}
    finally{setSavingPreferences(false);}
  }
  const backward=()=>setStep(current=>Math.max(0,current-1) as Step);
  return <PageFrame width="wide" className="launch-studio-page">
    <PageHeader eyebrow="Launch Studio / Site setup" title="Bring your Site to life."
      subtitle="Establish your Site, choose what you'd like to offer, and see a private website preview before configuring the details." />
    <nav aria-label="Setup progress" className="mt-6 grid border bg-card sm:grid-cols-4">
      {steps.map((label,index)=><div key={label} aria-current={index===step?"step":undefined}
        className={`flex items-center gap-3 border-b p-4 text-sm sm:border-b-0 sm:border-r last:border-r-0 ${index===step?"border-t-2 border-t-primary bg-accent":""}`}>
        <span className={`flex size-8 shrink-0 items-center justify-center border font-semibold ${index<step?"bg-success/10 text-success":index===step?"border-primary text-primary":"text-muted-foreground"}`}>
          {index<step?<Check className="size-4"/>:index+1}
        </span><span className="font-semibold">{label}</span>
      </div>)}
    </nav>
    {error&&<p role="alert" className="mt-4 border border-destructive p-4 text-sm text-destructive">{error}</p>}
    {step===0&&<form onSubmit={e=>void saveSite(e)} className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="space-y-5 border bg-card p-6 sm:p-8">
        <h2 className="font-serif text-3xl">Your Site</h2>
        <p className="text-sm text-muted-foreground">A Site is the home for your programs. Start with the essentials and add details later.</p>
        {options.sites.length>0&&<Field label="Continue with an existing Site">
          <Select value={siteId} onChange={e=>{setSiteId(e.target.value);setError("");}}>
            <option value="">Create a new Site</option>{options.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
          </Select>
        </Field>}
        {!siteId&&<>{!options.canCreateSite&&<p role="alert" className="border p-4 text-sm">This account cannot create a new Site. Select an authorized Site or request organization-wide Site creation access.</p>}
          <Field label="Site name" required><Input required maxLength={160} minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Your learning center name"/></Field>
          <Field label="Responsible organization" required><Select required value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">Select an organization</option>{options.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" required><Input required value={city} maxLength={120} onChange={e=>setCity(e.target.value)}/></Field>
            <Field label="State" required><Select required value={state} onChange={e=>setState(e.target.value)}><option value="">Select state</option>{Object.entries(usStatesAndTerritories).map(([code,label])=><option key={code} value={code}>{label}</option>)}</Select></Field>
          </div>
          <SiteTimezoneField label="Site time zone" value={timezone} onChange={setTimezone}/>
        </>}
        <fieldset><legend className="mb-3 text-sm font-semibold">How will you deliver learning?</legend>
          <div className="grid gap-3 sm:grid-cols-3">{([
            {id:"physical",title:"Physical",detail:"In person",icon:Building2},
            {id:"digital",title:"Digital",detail:"Online",icon:Monitor},
            {id:"both",title:"Both",detail:"In person and online",icon:Globe2},
          ] as const).map(x=><label key={x.id} className={`flex cursor-pointer flex-col gap-2 border p-4 ${delivery===x.id?"border-primary bg-accent":"bg-card"}`}>
            <input className="sr-only" type="radio" name="delivery" checked={delivery===x.id} onChange={()=>setDelivery(x.id)}/>
            <x.icon className="size-5 text-primary"/><strong className="text-sm">{x.title}</strong><span className="text-xs text-muted-foreground">{x.detail}</span>
          </label>)}</div>
        </fieldset>
        <Button disabled={(!siteId&&!options.canCreateSite)||siteMutation.isSubmitting} type="submit">
          {siteMutation.isSubmitting?"Saving Site…":siteId?"Continue with this Site":"Save Site and continue"} <ArrowRight className="size-4"/>
        </Button>
      </section>
      <aside className="self-start border bg-card p-6"><h2 className="font-serif text-2xl">Start simple.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your Site is established privately. Facility reviews, website publication and permission to enroll are separate steps.</p>
        <p className="mt-4 border-l-2 border-primary bg-accent p-4 text-sm">Delivery is your intended capability. Each program will have its own authorized delivery and enrollment configuration.</p>
      </aside>
    </form>}
    {step===1&&<section className="mt-6 max-w-4xl border bg-card p-6 sm:p-8">
      <h2 className="font-serif text-3xl">Are you associated with a network?</h2>
      <p className="mt-3 text-sm text-muted-foreground">Affiliation is optional. A network invitation is reviewed separately and does not itself grant access to network programs.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {([{id:"independent",title:"Continue independently",detail:"Explore programs available to your organization."},{id:"code",title:"I have a network code",detail:"Keep your invitation details for later verification."}] as const).map(item=><label key={item.id} className={`cursor-pointer border p-5 ${networkChoice===item.id?"border-primary bg-accent":""}`}>
          <input type="radio" name="network" className="sr-only" checked={networkChoice===item.id} onChange={()=>setNetworkChoice(item.id)}/><strong className="block text-sm">{item.title}</strong><span className="mt-2 block text-xs text-muted-foreground">{item.detail}</span>
        </label>)}
      </div>
      {networkChoice==="code"&&<div className="mt-5"><Field label="Network code (not yet submitted)"><Input maxLength={80} value={networkCode} onChange={e=>setNetworkCode(e.target.value)} placeholder="Enter invitation code"/></Field>
        <p className="mt-2 text-xs text-muted-foreground">Code verification and association are not enabled in this quick-start. Continue independently of network entitlements until verified.</p></div>}
      <div className="mt-7 flex gap-3"><Button variant="outline" onClick={backward}><ArrowLeft/> Back</Button><Button onClick={forward}>Continue <ArrowRight/></Button></div>
    </section>}
    {step===2&&<section className="mt-6 border bg-card p-6 sm:p-8">
      <h2 className="font-serif text-3xl">What would you like to offer?</h2>
      <p className="mt-2 text-sm text-muted-foreground">Choose any interests. These are ideas for your private website, not real Program records or enrollment openings.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{interests.map(item=>{
        const selected=chosen.includes(item.id);
        return <button type="button" aria-pressed={selected} key={item.id} onClick={()=>setChosen(old=>selected?old.filter(id=>id!==item.id):[...old,item.id])}
          className={`min-h-28 border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary ${selected?"border-primary bg-accent":"bg-background hover:border-primary"}`}>
          <div className="flex items-start justify-between"><item.icon className="size-5 text-primary"/>{selected&&<Check className="size-4 text-primary"/>}</div>
          <strong className="mt-3 block text-sm">{item.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>
        </button>;
      })}</div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{chosen.length} interests selected. Refine curriculum sources, schedules and offerings later.</span>
        <div className="flex gap-3"><Button variant="outline" onClick={backward}><ArrowLeft/> Back</Button><Button disabled={savingPreferences} onClick={()=>void revealSite()}>{savingPreferences?"Saving interests…":"See your Site preview"} <Sparkles/></Button></div>
      </div>
    </section>}
    {step===3&&<section className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-5">
        <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Private concept preview</p><h2 className="mt-1 font-serif text-3xl">Your Site is taking shape.</h2>
          <p className="mt-2 text-sm text-muted-foreground">This is a private concept based on your choices. It is not the published website or an open enrollment catalog.</p></div>
        <button type="button" onClick={backward} className="text-sm font-semibold text-primary underline">Edit interests</button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="overflow-hidden border bg-card">
          <div className="flex items-center justify-between gap-2 border-b bg-muted px-5 py-3 text-xs"><span>Private preview · {siteName}</span><span className="font-semibold text-warning">Not published</span></div>
          <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5"><strong className="font-serif text-2xl">{siteName}</strong><span className="text-xs text-muted-foreground">About · Programs · Community · Contact</span></header>
          <div className="bg-[#183D35] p-8 text-white sm:p-12"><p className="text-xs font-semibold uppercase tracking-widest text-[#EAD9A6]">Learn · Grow · Belong</p>
            <h3 className="mt-5 max-w-lg font-serif text-4xl leading-tight sm:text-5xl">A place to learn and grow together.</h3>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/85">Learning and opportunity for your community. Explore the experiences this Site is considering.</p>
            <span className="mt-6 inline-block border border-[#EAD9A6] px-5 py-3 text-xs font-bold text-[#EAD9A6]">Explore proposed programs</span>
          </div>
          <div className="p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your learning community</p><h3 className="mt-2 font-serif text-3xl">What we're exploring</h3>
            {previews.length?<div className="mt-5 grid gap-3 sm:grid-cols-2">{previews.map(item=><article key={item.id} className="border p-5"><item.icon className="size-5 text-primary"/><h4 className="mt-4 font-semibold">{item.title}</h4><p className="mt-2 text-xs text-muted-foreground">{item.detail}</p><span className="mt-4 inline-block text-xs font-semibold text-muted-foreground">Proposed · Not enrolling</span></article>)}</div>
              :<p className="mt-4 text-sm text-muted-foreground">Programs will appear as you select them in your workspace.</p>}
          </div>
        </div>
        <aside className="space-y-4 border bg-card p-6"><p className="text-xs font-bold uppercase tracking-widest text-primary">Your Site</p><h3 className="font-serif text-3xl">{siteName}</h3>
          <p className="text-sm text-muted-foreground">{siteCity}{siteCity&&siteState?", ":""}{siteState} · {delivery==="both"?"Physical and digital":delivery==="physical"?"Physical":"Digital"}</p>
          <p className="text-xs text-muted-foreground">{networkChoice==="independent"?"Operating independently":networkCode?"Network code captured in this preview only; verification pending":"Network affiliation not verified"}</p>
          <hr/><h4 className="font-semibold">Continue your launch</h4>
          <p className="text-sm text-muted-foreground">Website & Brand Studio manages the saved design. The existing Launch Hub is the next preparation workspace; individual program and enrollment activations still require their own authorization.</p>
          <div className="space-y-3">
            {siteId&&<Link to="/launch/website" search={{siteId,returnToHub:true}} className="flex min-h-11 items-center justify-between border border-primary px-4 text-sm font-semibold text-primary">Customize website <ArrowRight className="size-4"/></Link>}
            {siteId&&<Link to="/launch/hub/school" search={{siteId}} className="flex min-h-11 items-center justify-between border bg-primary px-4 text-sm font-semibold text-primary-foreground">Continue to Launch Hub <ArrowRight className="size-4"/></Link>}
          </div>
          <p className="border-l-2 border-warning bg-muted p-4 text-xs leading-5">Your delivery choices and program interests are saved as private Site planning data. A network code is not saved or verified here. This concept is not an active website or registration page.</p>
        </aside>
      </div>
    </section>}
  </PageFrame>;
}
