import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getUnifiedClassCourseOptions, getMyUnifiedClassDrafts, createUnifiedClassDraft,
  publishUnifiedClassOffering, closeUnifiedClassOffering,
} from "@/modules/classes/unified-class.functions";
import type { ClassOfferingTerms } from "@/domain/unified-class";

export const Route=createFileRoute("/canonical/classes")({component:NativeClasses});

type Method=ClassOfferingTerms["enrollmentMethods"][number];
type CreditMode=ClassOfferingTerms["allowedCreditModes"][number];
const methodOptions: {value:Method;label:string}[]=[
  {value:"self",label:"Self-enrollment"},{value:"assignment",label:"Assignment"},
  {value:"invitation",label:"Invitation"},{value:"approval",label:"Approval"},
];
const creditOptions: {value:CreditMode;label:string}[]=[
  {value:"not_applicable",label:"No academic credit"},
  {value:"audit",label:"Audit"},{value:"for_credit",label:"For credit (eligibility required)"},
];
const deliveryOptions=["self_paced","scheduled","facilitated","hybrid"] as const;
function optionKey(o:{deploymentId:string;adoptionId:string;offeringVersionId:string;courseVersionId:string}){
  return [o.deploymentId,o.adoptionId,o.offeringVersionId,o.courseVersionId].join(":");
}
function toggle<T extends string>(list:T[],name:T):T[]{
  return list.includes(name)?list.filter(v=>v!==name):[...list,name];
}
function utc(value:string):string|null{return value?new Date(value).toISOString():null;}

function NativeClasses(){
  const client=useQueryClient();
  const options=useQuery({queryKey:["native-class-course-options"],
    queryFn:()=>getUnifiedClassCourseOptions(),retry:false});
  const classes=useQuery({queryKey:["native-class-operator-classes"],
    queryFn:()=>getMyUnifiedClassDrafts(),retry:false});
  const [choice,setChoice]=useState("");
  const [title,setTitle]=useState("");
  const [siteId,setSiteId]=useState("");
  const [deliveryMode,setDeliveryMode]=useState<(typeof deliveryOptions)[number]>("self_paced");
  const [visibility,setVisibility]=useState<ClassOfferingTerms["visibility"]>("private");
  const [methods,setMethods]=useState<Method[]>(["assignment"]);
  const [creditModes,setCreditModes]=useState<CreditMode[]>(["not_applicable"]);
  const [opensAt,setOpensAt]=useState("");
  const [closesAt,setClosesAt]=useState("");
  const [capacity,setCapacity]=useState("");
  const [consentVersion,setConsentVersion]=useState("");
  const [consentText,setConsentText]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const selected=options.data?.find(row=>optionKey(row)===choice);
  async function refresh(){
    await Promise.all([
      client.invalidateQueries({queryKey:["native-class-course-options"]}),
      client.invalidateQueries({queryKey:["native-class-operator-classes"]}),
    ]);
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selected||busy||methods.length===0||creditModes.length===0)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await createUnifiedClassDraft({data:{
        definition:{
          deploymentId:selected.deploymentId,adoptionId:selected.adoptionId,
          offeringVersionId:selected.offeringVersionId,courseVersionId:selected.courseVersionId,
          operatingOrganizationId:selected.operatingOrganizationId,
          siteId:siteId||null,title:title.trim(),deliveryMode,
        },
        terms:{
          visibility,enrollmentMethods:methods,allowedCreditModes:creditModes,
          opensAt:utc(opensAt),closesAt:utc(closesAt),
          capacity:capacity?Number(capacity):null,
          consentVersion:methods.includes("self")?consentVersion.trim():null,
          consentText:methods.includes("self")?consentText.trim():null,
        },
      }});
      setNotice("Class created with its own draft Class Offering. It is not yet published. Class ID: "+result.classId);
      setChoice("");setTitle("");setSiteId("");
      await refresh();
    }catch(e){setError(normalizeClientError(e,"Could not create the native Class.").message)}
    finally{setBusy(false)}
  }
  async function action(classId:string,classOfferingVersionId:string,kind:"publish"|"close"){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try{
      if(kind==="publish"){
        await publishUnifiedClassOffering({data:{classId,classOfferingVersionId}});
        setNotice("Class Offering published under existing Course and Site authorization.");
      }else{
        await closeUnifiedClassOffering({data:{classId,classOfferingVersionId}});
        setNotice("Class Offering closed. Existing learning records remain intact.");
      }
      await refresh();
    }catch(e){setError(normalizeClientError(e,"Class Offering update failed.").message)}
    finally{setBusy(false)}
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Classes" title="Class management"
    subtitle="Create a Class from an adopted Course. Every Class has a Class Offering, whether private, unlisted or public. Enrollment method and academic credit are independent settings."
    actions={<Link to="/canonical" className="text-sm font-semibold text-primary underline underline-offset-4">Canonical workspace</Link>}>
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Create Class</h2>
        <p className="mt-2 text-sm text-muted-foreground">Select an approved Course Offering and authorized delivery context. The Class receives one Course version and one Class Offering identity.</p>
        {options.isPending&&<p role="status" className="mt-4 text-sm">Checking available Courses and operating authorizations…</p>}
        {options.isError&&<p role="alert" className="mt-4 border border-border p-3 text-sm">The native Class service is not available for this operator or environment. No changes were made.</p>}
        {options.data&&options.data.length===0&&<p role="status" className="mt-4 text-sm">No approved Course/Deployment combinations are currently available for your organization.</p>}
        <form onSubmit={event=>void create(event)} className="mt-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold" htmlFor="native-class-course">Approved Course Offering</label>
            <select id="native-class-course" required value={choice} onChange={e=>{setChoice(e.target.value);setSiteId("");}}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Select an authorized Course</option>
              {(options.data??[]).map(row=><option key={optionKey(row)} value={optionKey(row)}>
                {row.courseTitle} · {row.deploymentName}
              </option>)}
            </select>
          </div>
          <div><label className="block text-sm font-semibold" htmlFor="native-class-title">Class name</label>
            <input id="native-class-title" required minLength={3} maxLength={200} value={title}
              onChange={e=>setTitle(e.target.value)} placeholder="AI Literacy · January 2027"
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-semibold" htmlFor="native-class-mode">Delivery</label>
              <select id="native-class-mode" value={deliveryMode} onChange={e=>setDeliveryMode(e.target.value as typeof deliveryMode)}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
                {deliveryOptions.map(mode=><option key={mode} value={mode}>{mode.replace("_"," ")}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-semibold" htmlFor="native-class-site">Site</label>
              <select id="native-class-site" value={siteId} required={deliveryMode!=="self_paced"}
                onChange={e=>setSiteId(e.target.value)}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
                <option value="">No physical Site (self-paced only)</option>
                {(selected?.siteOptions??[]).map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="text-base font-semibold">Class Offering</h3>
            <p className="mt-1 text-sm text-muted-foreground">Availability and admission methods do not change the Course or Class identity.</p>
            <div className="mt-4">
              <label htmlFor="native-class-visibility" className="block text-sm font-semibold">Visibility</label>
              <select id="native-class-visibility" value={visibility}
                onChange={e=>setVisibility(e.target.value as typeof visibility)}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </select>
            </div>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Allowed enrollment methods</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{methodOptions.map(method=><label key={method.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={methods.includes(method.value)}
                  onChange={()=>setMethods(toggle(methods,method.value))}/> {method.label}
              </label>)}</div>
            </fieldset>
            <fieldset className="mt-4">
              <legend className="text-sm font-semibold">Allowed credit participation</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{creditOptions.map(mode=><label key={mode.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={creditModes.includes(mode.value)}
                  onChange={()=>setCreditModes(toggle(creditModes,mode.value))}/> {mode.label}
              </label>)}</div>
              <p className="mt-2 text-xs text-muted-foreground">For-credit participation does not award credit without separate institutional approval and an earned outcome.</p>
            </fieldset>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div><label htmlFor="native-class-open" className="block text-sm font-semibold">Opens</label>
                <input id="native-class-open" type="datetime-local" value={opensAt}
                  onChange={e=>setOpensAt(e.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-2 text-sm"/>
              </div>
              <div><label htmlFor="native-class-close" className="block text-sm font-semibold">Closes</label>
                <input id="native-class-close" type="datetime-local" value={closesAt}
                  onChange={e=>setClosesAt(e.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-2 text-sm"/>
              </div>
              <div><label htmlFor="native-class-capacity" className="block text-sm font-semibold">Capacity</label>
                <input id="native-class-capacity" type="number" min={1} value={capacity} placeholder="Unlimited"
                  onChange={e=>setCapacity(e.target.value)} className="mt-2 min-h-11 w-full border border-border bg-background px-2 text-sm"/>
              </div>
            </div>
            {methods.includes("self")&&<div className="mt-4 space-y-3">
              <p className="text-sm font-semibold">Self-enrollment consent terms</p>
              <div><label htmlFor="native-class-consent-version" className="block text-xs font-semibold">Version</label>
                <input id="native-class-consent-version" value={consentVersion} required minLength={3}
                  onChange={e=>setConsentVersion(e.target.value)} placeholder="participation-v1"
                  className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/></div>
              <div><label htmlFor="native-class-consent-text" className="block text-xs font-semibold">Participation and data-use terms</label>
                <textarea id="native-class-consent-text" value={consentText} required minLength={25} maxLength={10000} rows={4}
                  onChange={e=>setConsentText(e.target.value)}
                  className="mt-1 w-full border border-border bg-background p-3 text-sm"/></div>
            </div>}
          </div>
          <Button disabled={busy||!selected||methods.length===0||creditModes.length===0} type="submit">
            {busy?"Working…":"Create draft Class"}
          </Button>
        </form>
      </section>
      <section className="border border-border bg-card p-5" aria-label="Managed Classes">
        <h2 className="font-serif text-2xl">My Classes</h2>
        <p className="mt-2 text-sm text-muted-foreground">Current Class Offering versions in your authorized organization and Sites.</p>
        {classes.isPending&&<p role="status" className="mt-4 text-sm">Loading Classes…</p>}
        {classes.isError&&<p role="alert" className="mt-4 text-sm">Class records are unavailable or the release is not enabled.</p>}
        <div className="mt-4 space-y-3">
          {(classes.data??[]).map(item=><article key={item.classOfferingVersionId} className="border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {item.visibility} · {item.offeringState} · version {item.versionNo}
            </p>
            <h3 className="mt-1 text-base font-semibold"><Link to="/classes/$classId"
              params={{classId:item.classId}} search={{view:"manage",tab:"overview"}}
              className="underline-offset-2 hover:underline">{item.title}</Link></h3>
            <p className="mt-2 text-xs text-muted-foreground">{item.deliveryMode.replace("_"," ")} · {item.enrollmentMethods.join(", ")}</p>
            <Link to="/classes/$classId" params={{classId:item.classId}} search={{view:"manage",tab:"overview"}}
              className="mt-2 inline-block text-sm font-semibold underline">Open Class workspace</Link>
            {item.offeringState==="draft"&&<Button disabled={busy} className="mt-3"
              onClick={()=>void action(item.classId,item.classOfferingVersionId,"publish")}>Publish Class Offering</Button>}
            {item.offeringState==="published"&&<Button disabled={busy} className="mt-3" variant="outline"
              onClick={()=>void action(item.classId,item.classOfferingVersionId,"close")}>Close enrollment</Button>}
          </article>)}
          {classes.data?.length===0&&<p className="text-sm text-muted-foreground">No Classes created yet.</p>}
        </div>
      </section>
    </div>
    {notice&&<p role="status" className="mt-5 border border-border bg-card p-4 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-5 border border-border bg-card p-4 text-sm">{error}</p>}
  </WorkspaceShell>;
}
