import { useState, type FormEvent } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Check, Globe2, GraduationCap, Monitor, Sparkles, Users } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import { SiteAffiliationPanel } from "@/components/operations/SiteAffiliationPanel";
import { siteFirstLaunchSteps, type SiteFirstLaunchStep } from "@/domain/launch-studio";
import type { SiteLaunchPreferences } from "@/domain/site-launch-preferences";
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
export function SiteFirstLaunch({options,selectedSiteId="",initialStep="site",initialPreferences=null,selectionError=null}:{
  options:Options;selectedSiteId?:string;initialStep?:SiteFirstLaunchStep;
  initialPreferences?:SiteLaunchPreferences|null;selectionError?:string|null;
}) {
  const router=useRouter();
  const [siteId,setSiteId] = useState(selectedSiteId);
  const step=(siteId?siteFirstLaunchSteps.indexOf(initialStep):0) as Step;
  const [name,setName] = useState("");
  const [organizationId,setOrganizationId] = useState("");
  const [city,setCity] = useState("");
  const [state,setState] = useState("");
  const [timezone,setTimezone] = useState("");
  const [delivery,setDelivery] = useState<Delivery>(initialPreferences?.delivery??"both");
  const [chosen,setChosen] = useState<string[]>(initialPreferences?.interestIds??[]);
  const [error,setError] = useState("");
  const [savingPreferences,setSavingPreferences] = useState(false);
  const [previewKey,setPreviewKey] = useState(0);
  const siteMutation=useWorkspaceMutation({mutationFn:createLaunchSite});
  const known=options.sites.find(s=>s.id===siteId);
  const siteName=known?.name??name;
  const siteCity=known?.planningLocation?.city??city;
  const siteState=known?.planningLocation?.state??state;

  function goTo(next:SiteFirstLaunchStep,nextSiteId=siteId) {
    void router.navigate({to:"/launch/site",search:{siteId:nextSiteId||undefined,step:next},replace:true})
      .catch(()=>setError("Your Site remains saved, but navigation failed. Reload this page to resume."));
  }
  async function saveSite(e:FormEvent) {
    e.preventDefault();
    if(siteMutation.isSubmitting)return;
    setError("");
    if(siteId) {
      try {
        const preferences=await readSiteLaunchPreferences({data:{siteId}});
        if(preferences){setDelivery(preferences.delivery);setChosen(preferences.interestIds);}
        goTo("network");
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
      goTo("network",saved.value.siteId);
    }catch(cause){setError(mutationErrorMessage(cause,"Unable to establish your Site. Nothing has been published."));}
  }

  const forward=()=>goTo(siteFirstLaunchSteps[Math.min(3,step+1)]!);
  async function revealSite(){
    if(!siteId||savingPreferences)return;
    setSavingPreferences(true);setError("");
    try {
      await saveSiteLaunchPreferences({data:{siteId,preferences:{delivery,interestIds:chosen}}});
      goTo("preview");
    }catch(cause){setError(mutationErrorMessage(cause,"Unable to save program interests. The Site remains private."));}
    finally{setSavingPreferences(false);}
  }
  const backward=()=>goTo(siteFirstLaunchSteps[Math.max(0,step-1)]!);
  if(selectionError) return <PageFrame width="wide" className="launch-studio-page">
    <PageHeader eyebrow="Launch Studio" title="Choose an authorized Site"
      subtitle="Site access is verified against your active account and role."/>
    <p role="alert" className="mt-6 border border-destructive bg-card p-5 text-sm">{selectionError}</p>
    <Link to="/launch/site" search={{step:"site"}} className="mt-5 inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
      Choose another Site <ArrowRight className="size-4"/>
    </Link>
  </PageFrame>;
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
        <p className="text-sm text-muted-foreground">A Site is the home for all your programs. Start with the essentials and add details later. Return here without recreating a Site.</p>
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
      <h2 className="font-serif text-3xl">Your network, if you have one.</h2>
      <p className="mt-3 text-sm text-muted-foreground">You can operate independently. To join a network, submit a real Site affiliation request below. Network HQ must review it before any network-specific access becomes available.</p>
      <SiteAffiliationPanel siteId={siteId}/>
      <div className="mt-7 flex flex-wrap gap-3">
        <Button variant="outline" onClick={backward}><ArrowLeft/> Back</Button>
        <Button onClick={forward}>Continue to programs <ArrowRight/></Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">No network relationship is required. Pending requests never grant membership, content, branding or student data access.</p>
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
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Live Site renderer · private preview</p>
          <h2 className="mt-1 font-serif text-3xl">Your Site is taking shape.</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">This uses your Site's actual website design engine and saved plans. Proposed interests are marked as such. Your Site is not published and enrollment is not open by default.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={()=>setPreviewKey(k=>k+1)}>Refresh website</Button>
          <Button type="button" variant="outline" onClick={backward}>Edit interests</Button>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden border bg-card" aria-label="Real private website preview">
          <div className="flex items-center justify-between border-b bg-muted px-5 py-3 text-xs">
            <span>Canonical website preview · {siteName}</span>
            <span className="font-semibold text-warning">Private · not published</span>
          </div>
          {siteId ? <iframe key={previewKey} title={`Private rendered website preview for ${siteName}`}
            src={`/launch/site-preview?siteId=${encodeURIComponent(siteId)}`}
            className="block min-h-[820px] w-full border-0 bg-white"
            sandbox="allow-same-origin" referrerPolicy="no-referrer"
          /> : <p role="alert" className="p-6">Save a Site before opening its website preview.</p>}
        </section>
        <aside className="self-start space-y-5 border bg-card p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Your Site</p>
          <h3 className="font-serif text-3xl">{siteName}</h3>
          <p className="text-sm text-muted-foreground">{siteCity}{siteCity&&siteState?", ":""}{siteState} · {delivery==="both"?"Physical and digital":delivery==="physical"?"Physical":"Digital"}</p>
          <p className="text-sm text-muted-foreground">{chosen.length} proposed interests selected. Adding real approved Offerings is a separate step.</p>
          <p className="border-l-2 border-warning bg-muted p-4 text-xs">
            Network-specific access requires independently approved Site affiliation. These private plans do not confer membership or program rights.
          </p>
          <hr/>
          <h4 className="font-semibold">What would you like to do next?</h4>
          <div className="space-y-3">
            {siteId&&options.schoolSetupAdministrator&&<Link to="/launch/website" search={{siteId,returnToHub:true}} className="flex min-h-11 items-center justify-between border bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Customize website <ArrowRight className="size-4"/>
            </Link>}
            {!options.schoolSetupAdministrator&&<p className="border p-4 text-sm text-muted-foreground">To customize your Site website, ask an authorized Site Administrator to assign website editing access. You can still explore your private preview.</p>}
            <Link to="/programs/noncredit/enrollment" search={{publicSiteId:siteId}} className="flex min-h-11 items-center justify-between border px-4 text-sm font-semibold text-primary">
              Make programs enrollable <ArrowRight className="size-4"/>
            </Link>
            {siteId&&options.schoolSetupAdministrator&&<Link to="/sites/$siteId/publish" params={{siteId}} className="flex min-h-11 items-center justify-between border px-4 text-sm font-semibold text-primary">
              Share or publish your Site <ArrowRight className="size-4"/>
            </Link>}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            You can keep designing without publishing. Enrollment and public sharing
            require separately approved offerings, current Site authority and publication.
            The next workspace will verify your permissions.
          </p>
          <details className="border p-4 text-xs">
            <summary className="cursor-pointer font-semibold text-primary">Advanced setup and approvals</summary>
            <div className="mt-3 space-y-3">
              <p className="text-muted-foreground">For operators managing existing canonical education records, these governed workspaces are available without changing your initial Site plans.</p>
              {siteId&&<Link to="/site-identity" search={{mode:"request",siteId}}
                className="block font-semibold text-primary underline">Verify existing Site identity connection</Link>}
              <Link to="/canonical/blueprints" search={{}}
                className="block font-semibold text-primary underline">Manage approved educational blueprints</Link>
              {siteId&&<Link to="/launch/hub/school" search={{siteId}}
                className="block font-semibold text-primary underline">School-specific readiness</Link>}
            </div>
          </details>
        </aside>
      </div>
    </section>}
  </PageFrame>;
}
