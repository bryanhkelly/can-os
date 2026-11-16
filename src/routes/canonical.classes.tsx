import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getUnifiedClassCourseOptions, getMyUnifiedClassDrafts, createUnifiedClassDraft,
  publishUnifiedClassOffering, closeUnifiedClassOffering,
  activateUnifiedClass, createNextUnifiedClassOfferingVersion,
} from "@/modules/classes/unified-class.functions";
import type { ClassOfferingTerms } from "@/domain/unified-class";
import { assessLocalRollout, parsePortableRollout, serializeProgramRollout, type ProgramRolloutRecipe } from "@/domain/network-program-rollout";

export const Route=createFileRoute("/canonical/classes")({
 validateSearch:(raw:Record<string,unknown>)=>z.object({siteId:z.string().uuid().optional()}).strip().parse(raw),
 component:NativeClassesScope,
});

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

function NativeClassesScope(){
  const {siteId}=Route.useSearch();
  // Changing Site drops the previous Site's unsaved Class composer state.
  // Each command additionally checks current native Site authority.
  return <NativeClasses key={siteId??"all"}/>;
}
function NativeClasses(){
  const {siteId:preferredSiteId}=Route.useSearch();
  const client=useQueryClient();
  const options=useQuery({queryKey:["native-class-course-options"],
    queryFn:()=>getUnifiedClassCourseOptions(),retry:false});
  const classes=useQuery({queryKey:["native-class-operator-classes"],
    queryFn:()=>getMyUnifiedClassDrafts(),retry:false});
  const [choice,setChoice]=useState("");
  const [recipeText,setRecipeText]=useState("");
  const [recipeCourseId,setRecipeCourseId]=useState<string|null>(null);
  const [recipeOfferingVersionId,setRecipeOfferingVersionId]=useState<string|null>(null);
  const [recipePlan,setRecipePlan]=useState<ProgramRolloutRecipe|null>(null);
  const [title,setTitle]=useState("");
  const [classCapacity,setClassCapacity]=useState("");
  const [siteId,setSiteId]=useState("");
  const [deliveryMode,setDeliveryMode]=useState<(typeof deliveryOptions)[number]>(preferredSiteId?"facilitated":"self_paced");
  const [createWithOffering,setCreateWithOffering]=useState(false);
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
  // A deep link is only a suggestion; the server independently validates
  // current Course adoption and operating Site rights on Class creation.
  const visibleOptions=(options.data??[]).filter(row=>
    (!recipeCourseId||row.courseVersionId===recipeCourseId) &&
    (!recipeOfferingVersionId||row.offeringVersionId===recipeOfferingVersionId) &&
    (!preferredSiteId||row.siteOptions.some(site=>site.id===preferredSiteId)));
  const rolloutReadiness=recipePlan
    ?assessLocalRollout(recipePlan,options.data??[],siteId||preferredSiteId||null):[];
  // Offering versions remain canonical publisher products. Each authorized
  // adoption may support many Course components and local Classes; no extra
  // Program records are synthesized for standalone Courses.
  const offeringGroups=Array.from(new Set((options.data??[]).map(row=>row.offeringVersionId)))
    .map(id=>{
      const rows=(options.data??[]).filter(row=>row.offeringVersionId===id);
      const components=rows
        .filter((row,index)=>rows.findIndex(other=>other.courseVersionId===row.courseVersionId)===index)
        .sort((a,b)=>(a.sequenceNo??Number.MAX_SAFE_INTEGER)-(b.sequenceNo??Number.MAX_SAFE_INTEGER)||
          a.courseTitle.localeCompare(b.courseTitle));
      return {id,first:rows[0]!,components};
    });
  function chooseRolloutCourse(course:ProgramRolloutRecipe["courses"][number]){
    setRecipeCourseId(course.courseVersionId);
    setChoice("");setSiteId("");
    setTitle(course.suggestedClassTitle);
    setDeliveryMode(course.deliveryMode);
    setClassCapacity(course.capacity===null?"":String(course.capacity));
    setCreateWithOffering(false);
    setNotice("Review the local Course adoption, Site and Class terms. Loading a recipe never publishes or enrolls anyone.");
  }
  async function exportLaunchRecipe(){
    if(!selected)return;
    try{
      // Export the available Course components of this one published Offering
      // version. Never embed a Site grant, enrollment, assessment or content.
      const rows=(options.data??[])
        .filter(row=>row.offeringVersionId===selected.offeringVersionId)
        .filter((row,index,all)=>all.findIndex(candidate=>candidate.courseVersionId===row.courseVersionId)===index)
        .sort((a,b)=>(a.sequenceNo??Number.MAX_SAFE_INTEGER)-(b.sequenceNo??Number.MAX_SAFE_INTEGER)||
          a.courseTitle.localeCompare(b.courseTitle));
      const plan:ProgramRolloutRecipe={
        version:2,revision:1,
        offeringVersionId:selected.offeringVersionId,
        offeringTitle:selected.offeringTitle,offeringKind:selected.offeringKind,
        courses:rows.map(row=>({
          courseVersionId:row.courseVersionId,courseTitle:row.courseTitle,
          isRequired:row.isRequired,sequenceNo:row.sequenceNo,
          suggestedClassTitle:row.courseVersionId===selected.courseVersionId&&title.trim()
            ?title.trim():row.courseTitle,
          deliveryMode:row.courseVersionId===selected.courseVersionId?deliveryMode:"facilitated",
          capacity:row.courseVersionId===selected.courseVersionId&&classCapacity?Number(classCapacity):null,
          recommendedSessionMinutes:60,
        })),
      };
      const value=serializeProgramRollout(plan);
      setRecipeText(value);setRecipePlan(plan);
      setRecipeOfferingVersionId(plan.offeringVersionId);
      try{
        await navigator.clipboard.writeText(value);
        setNotice("Versioned publisher rollout copied. Every receiving operator must independently adopt the Offering and authorize its Site.");
      }catch{
        setNotice("Versioned publisher rollout prepared below. Copy it to share with another authorized operator.");
      }
      setError("");
    }catch(error){
      setError(normalizeClientError(error,"Cannot prepare rollout instructions.").message);
    }
  }
  function importLaunchRecipe(){
    try{
      const recipe=parsePortableRollout(recipeText);
      // Neither v1 nor v2 carries a Site or Organization grant.
      setChoice("");setSiteId("");setCreateWithOffering(false);
      if(recipe.version===1){
        if(!(options.data??[]).some(row=>row.courseVersionId===recipe.courseVersionId))
          throw new Error("This Course is not currently approved for your organization. No Class was created.");
        setRecipePlan(null);setRecipeOfferingVersionId(null);
        setRecipeCourseId(recipe.courseVersionId);
        setTitle(recipe.suggestedClassTitle);
        setDeliveryMode(recipe.deliveryMode);
        setClassCapacity(recipe.capacity===null?"":String(recipe.capacity));
        setNotice("Legacy Class setup loaded. Select your approved Course Offering and Site. Suggested Session duration: "+recipe.recommendedSessionMinutes+" minutes.");
      }else{
        setRecipePlan(recipe);
        setRecipeOfferingVersionId(recipe.offeringVersionId);
        setRecipeCourseId(null);
        setTitle("");setClassCapacity("");
        setNotice("Published Offering version "+recipe.revision+" rollout instructions loaded. Select each approved Course below. Missing adoptions must be approved separately before creating Classes.");
      }
      setError("");
    }catch(error){
      setError(normalizeClientError(error,"Invalid rollout instructions.").message);
    }
  }
  async function refresh(){
    await Promise.all([
      client.invalidateQueries({queryKey:["native-class-course-options"]}),
      client.invalidateQueries({queryKey:["native-class-operator-classes"]}),
    ]);
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selected||busy||(createWithOffering&&(methods.length===0||creditModes.length===0)))return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await createUnifiedClassDraft({data:{
        definition:{
          deploymentId:selected.deploymentId,adoptionId:selected.adoptionId,
          offeringVersionId:selected.offeringVersionId,courseVersionId:selected.courseVersionId,
          operatingOrganizationId:selected.operatingOrganizationId,
          siteId:siteId||null,title:title.trim(),deliveryMode,
          capacity:classCapacity?Number(classCapacity):null,
        },
        terms:createWithOffering?{
          visibility,enrollmentMethods:methods,allowedCreditModes:creditModes,
          opensAt:utc(opensAt),closesAt:utc(closesAt),
          capacity:capacity?Number(capacity):null,
          consentVersion:methods.includes("self")?consentVersion.trim():null,
          consentText:methods.includes("self")?consentText.trim():null,
        }:null,
      }});
      setNotice(result.classOfferingVersionId
        ?"Class and optional draft Class Offering created. Class ID: "+result.classId
        :"Class created without any Class Offering. Activate it to use internal assignment. Class ID: "+result.classId);
      setChoice("");setTitle("");setSiteId("");setClassCapacity("");
      setRecipeCourseId(null);
      await refresh();
    }catch(e){setError(normalizeClientError(e,"Could not create the native Class.").message)}
    finally{setBusy(false)}
  }
  function currentTerms():ClassOfferingTerms{
    return {
      visibility,enrollmentMethods:methods,allowedCreditModes:creditModes,
      opensAt:utc(opensAt),closesAt:utc(closesAt),
      capacity:capacity?Number(capacity):null,
      consentVersion:methods.includes("self")?consentVersion.trim():null,
      consentText:methods.includes("self")?consentText.trim():null,
    };
  }
  async function activate(classId:string){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try{
      await activateUnifiedClass({data:{classId}});
      await refresh();
      setNotice("Class activated independently of registration publication.");
    }catch(e){setError(normalizeClientError(e,"Could not activate Class.").message)}
    finally{setBusy(false)}
  }
  async function addOffering(classId:string){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try{
      await createNextUnifiedClassOfferingVersion({data:{classId,terms:currentTerms()}});
      await refresh();
      setNotice("Optional Class Offering draft created. Publish it when ready.");
    }catch(e){setError(normalizeClientError(e,"Could not create Class Offering.").message)}
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
    subtitle="Create a Class from an adopted Course. Class Offerings are optional: school and private assignment do not require a public or private registration listing."
    actions={<div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
      <Link to="/canonical/course-activities" className="underline underline-offset-4">
        Course activities
      </Link>
      <Link to="/canonical" className="underline underline-offset-4">
        Canonical workspace
      </Link>
    </div>}>
    <section className="mt-5 border border-border bg-card p-5" aria-label="Approved Offering hierarchy">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">Programs, Courses and local Classes</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Published publisher products are adopted once per authorized Deployment.
            Each Course retains its published version; local Classes configure delivery without rewriting content.
            Standalone Courses do not require a Program or network membership.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link to="/canonical/blueprints" className="underline">Approved Blueprints</Link>
          <Link to="/canonical/lab/deployments" className="underline">Deployments and adoptions</Link>
          <Link to="/canonical/course-activities" className="underline">Learning activities</Link>
        </div>
      </div>
      {options.data&&offeringGroups.length===0&&<p className="mt-4 text-sm text-muted-foreground">
        No currently authorized published Course adoption is available. Publisher approval and local adoption are separate from this workspace.
      </p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {offeringGroups.map(group=><article key={group.id} className="border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.first.offeringKind==="program"?"Program Offering":group.first.offeringKind==="course"?"Course Offering":"Published Offering"} · v{group.first.offeringVersionNo}
          </p>
          <h3 className="mt-1 text-base font-semibold">{group.first.offeringTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.components.length} available Course component(s) · Publisher content is read-only
          </p>
          <ul className="mt-3 space-y-2">
            {group.components.map(row=><li key={row.courseVersionId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-sm">
              <div>
                <p className="font-semibold">{row.courseTitle} · v{row.courseVersionNo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.isRequired?"Required":"Optional"} · {row.siteOptions.length} authorized delivery Site(s)
                </p>
              </div>
              <Button type="button" size="sm" variant="outline"
                onClick={()=>{
                  setRecipePlan(null);setRecipeCourseId(null);setRecipeOfferingVersionId(null);
                  setChoice(optionKey(row));setTitle(row.courseTitle);
                  setSiteId(preferredSiteId&&row.siteOptions.some(site=>site.id===preferredSiteId)?preferredSiteId:"");
                  setNotice("Approved Course selected. Review local delivery configuration before creating a Class.");
                }}>Configure Class</Button>
            </li>)}
          </ul>
        </article>)}
      </div>
    </section>
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Create Class</h2>
        <p className="mt-2 text-sm text-muted-foreground">Select an approved Course and authorized delivery context. The Class identity is independent of registration publication.</p>
        {options.isPending&&<p role="status" className="mt-4 text-sm">Checking available Courses and operating authorizations…</p>}
        {options.isError&&<p role="alert" className="mt-4 border border-border p-3 text-sm">The native Class service is not available for this operator or environment. No changes were made.</p>}
        {options.data&&visibleOptions.length===0&&<p role="status" className="mt-4 text-sm">
          {preferredSiteId?"No approved Course/Deployment is available for this Site and current canonical grant.":"No approved Course/Deployment combinations are currently available for your organization."}
        </p>}
        <section className="mt-5 border border-border bg-muted/20 p-4"
          aria-label="Network Class launch recipe">
          <h3 className="font-semibold">Roll out a published Course or Program</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Share versioned setup instructions for one approved Offering and its Course components,
            without copying instructional content or records. Each independent or network operator
            must adopt the published Offering and separately authorize local Classes.
          </p>
          <label className="mt-3 block text-sm font-semibold" htmlFor="native-network-recipe">
            Portable publisher rollout (JSON, legacy Class recipes also accepted)
          </label>
          <textarea id="native-network-recipe" value={recipeText} rows={4}
            maxLength={4000} onChange={e=>setRecipeText(e.target.value)}
            placeholder="Paste a Class launch recipe from an approved partner"
            className="mt-1 w-full border border-border bg-background p-3 font-mono text-xs"/>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!selected}
              onClick={()=>void exportLaunchRecipe()}>Copy Offering rollout</Button>
            <Button type="button" variant="outline" disabled={!recipeText.trim()}
              onClick={importLaunchRecipe}>Review local rollout</Button>
            {(recipePlan||recipeCourseId)&&<Button type="button" variant="outline"
              onClick={()=>{setRecipeCourseId(null);setRecipeOfferingVersionId(null);
                setRecipePlan(null);setChoice("");setSiteId("");}}>
              Clear rollout filter
            </Button>}
          </div>
          {recipePlan&&<div className="mt-4 space-y-2" aria-label="Local rollout checklist">
            <p className="text-sm font-semibold">{recipePlan.offeringTitle} · rollout v{recipePlan.revision}</p>
            <p className="text-xs text-muted-foreground">
              Readiness reflects current visible local Course options only. It is not a grant or publication approval.
              Every Class and optional Class Offering is created independently under a server-side authorization check.
            </p>
            {recipePlan.courses.map((course,index)=>{
              const status=rolloutReadiness[index]?.status??"adoption_required";
              return <div key={course.courseVersionId} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3 text-sm">
                <div>
                  <p className="font-semibold">{course.courseTitle} {course.isRequired?"· Required":"· Optional"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status==="ready"?"Approved local adoption found. Review Site and staffing before launch."
                      :status==="site_authorization_required"?"Current Site is not authorized for this Course."
                      :"No approved adoption of this Offering version for your organization."}
                  </p>
                </div>
                <Button type="button" variant="outline" disabled={status!=="ready"}
                  onClick={()=>chooseRolloutCourse(course)}>Prepare Class</Button>
              </div>;
            })}
          </div>}
          {recipeCourseId&&<p role="status" className="mt-2 text-xs">
            Only locally approved Course options matching this recipe are available below.
          </p>}
        </section>
        <form onSubmit={event=>void create(event)} className="mt-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold" htmlFor="native-class-course">Approved Course Offering</label>
            <select id="native-class-course" required value={choice} onChange={e=>{
              const selectedOption=visibleOptions.find(option=>optionKey(option)===e.target.value);
              setChoice(e.target.value);
              setSiteId(selectedOption?.siteOptions.some(site=>site.id===preferredSiteId)?preferredSiteId??"":"");
            }}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Select an authorized Course</option>
              {visibleOptions.map(row=><option key={optionKey(row)} value={optionKey(row)}>
                {row.offeringTitle} · {row.courseTitle} (v{row.courseVersionNo}) · {row.deploymentName}
              </option>)}
            </select>
          </div>
          {selected&&<aside className="border border-border bg-muted/20 p-4 text-sm">
            <p className="font-semibold">{selected.offeringKind==="program"?"Program":selected.offeringKind==="course"?"Course Offering":"Published Offering"} · {selected.offeringTitle} (v{selected.offeringVersionNo})</p>
            <p className="mt-1 text-muted-foreground">
              Adopted Course: {selected.courseTitle}, version {selected.courseVersionNo}
              {selected.isRequired?" · required component":" · optional component"}.
              Local Classes retain this published Course version.
            </p>
            <p className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
              <Link to="/canonical/lab/deployments" className="underline">Deployment and adoption</Link>
              <Link to="/operations/curriculum" className="underline">Curriculum</Link>
              <Link to="/canonical/course-activities" className="underline">Course activities</Link>
            </p>
          </aside>}
          <div><label className="block text-sm font-semibold" htmlFor="native-class-title">Class name</label>
            <input id="native-class-title" required minLength={3} maxLength={200} value={title}
              onChange={e=>setTitle(e.target.value)} placeholder="AI Literacy · January 2027"
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="native-class-overall-capacity">
              Class capacity
            </label>
            <input id="native-class-overall-capacity" type="number" min={1}
              value={classCapacity} placeholder="Unlimited"
              onChange={event=>setClassCapacity(event.target.value)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            <p className="mt-2 text-xs text-muted-foreground">
              This is the total number of seats in the Class across every enrollment method.
              A Class Offering may impose an additional, lower registration limit.
            </p>
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
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" checked={createWithOffering}
                onChange={event=>setCreateWithOffering(event.target.checked)}/>
              Also create a draft Class Offering
            </label>
            {createWithOffering&&<div className="mt-4">
            <h3 className="text-base font-semibold">Class Offering terms</h3>
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
            </div>}
          </div>
          <Button disabled={busy||!selected||(createWithOffering&&(methods.length===0||creditModes.length===0))} type="submit">
            {busy?"Working…":"Create draft Class"}
          </Button>
        </form>
      </section>
      <section className="border border-border bg-card p-5" aria-label="Managed Classes">
        <h2 className="font-serif text-2xl">My Classes</h2>
        <p className="mt-2 text-sm text-muted-foreground">Classes in your authorized organization and Sites, including Classes without an Offering.</p>
        {classes.isPending&&<p role="status" className="mt-4 text-sm">Loading Classes…</p>}
        {classes.isError&&<p role="alert" className="mt-4 text-sm">Class records are unavailable or the release is not enabled.</p>}
        <div className="mt-4 space-y-3">
          {(classes.data??[]).map(item=><article key={item.classOfferingVersionId??item.classId} className="border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {item.classOfferingVersionId
                ?`${item.visibility} · ${item.offeringState} · version ${item.versionNo}`
                :"No Class Offering · internal Class"}
            </p>
            <h3 className="mt-1 text-base font-semibold"><Link to="/classes/$classId"
              params={{classId:item.classId}} search={{view:"manage",tab:"overview"}}
              className="underline-offset-2 hover:underline">{item.title}</Link></h3>
            <p className="mt-2 text-xs text-muted-foreground">{item.deliveryMode.replace("_"," ")} · {(item.enrollmentMethods??[]).join(", ")||"No registration publication"}</p>
            <Link to="/classes/$classId" params={{classId:item.classId}} search={{view:"manage",tab:"overview"}}
              className="mt-2 inline-block text-sm font-semibold underline">Open Class workspace</Link>
            {item.state!=="active"&&<Button disabled={busy} className="mt-3 mr-2" onClick={()=>void activate(item.classId)}>Activate Class</Button>}
            {!item.classOfferingVersionId&&<Button disabled={busy||methods.length===0||creditModes.length===0} className="mt-3 mr-2" variant="outline"
              onClick={()=>void addOffering(item.classId)}>Create draft Offering from form terms</Button>}
            {item.offeringState==="draft"&&item.classOfferingVersionId&&<Button disabled={busy} className="mt-3"
              onClick={()=>void action(item.classId,item.classOfferingVersionId,"publish")}>Publish Class Offering</Button>}
            {item.offeringState==="published"&&item.classOfferingVersionId&&<Button disabled={busy} className="mt-3" variant="outline"
              onClick={()=>void action(item.classId,item.classOfferingVersionId,"close")}>Close enrollment</Button>}
            {item.offeringState==="closed"&&item.classOfferingVersionId&&<Button
              disabled={busy||methods.length===0||creditModes.length===0}
              className="mt-3 ml-2" variant="outline"
              onClick={()=>void addOffering(item.classId)}>Draft new Offering terms</Button>}
          </article>)}
          {classes.data?.length===0&&<p className="text-sm text-muted-foreground">No Classes created yet.</p>}
        </div>
      </section>
    </div>
    {notice&&<p role="status" className="mt-5 border border-border bg-card p-4 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-5 border border-border bg-card p-4 text-sm">{error}</p>}
  </WorkspaceShell>;
}
