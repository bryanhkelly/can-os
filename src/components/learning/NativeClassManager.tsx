import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { NativeClassLaunchReadiness } from "@/components/learning/NativeClassLaunchReadiness";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getUnifiedClassCourseOptions, getNativeClassOperatorSites,
  getMyUnifiedClassDrafts, createUnifiedClassDraft,
  publishUnifiedClassOffering, closeUnifiedClassOffering,
  activateUnifiedClass, createNextUnifiedClassOfferingVersion,
} from "@/modules/classes/unified-class.functions";
import type { ClassOfferingTerms } from "@/domain/unified-class";
import { getPublisherRolloutTemplate } from "@/modules/programs/publisher-rollout.functions";
import { assessLocalRollout, parsePortableRollout, serializeProgramRollout, type ProgramRolloutRecipe } from "@/domain/network-program-rollout";


type Method=ClassOfferingTerms["enrollmentMethods"][number];
type CreditMode=ClassOfferingTerms["allowedCreditModes"][number];
const methodOptions: {value:Method;label:string}[]=[
  {value:"self",label:"Self-enrollment"},{value:"assignment",label:"Assignment"},
  {value:"invitation",label:"Invitation (verified adults)"},
  {value:"approval",label:"Approval required (verified adults)"},
];
const creditOptions: {value:CreditMode;label:string}[]=[
  {value:"not_applicable",label:"No academic credit"},
  {value:"audit",label:"Audit"},
  // For-credit participation needs institutional eligibility and issuer approval.
];
const deliveryOptions=["self_paced","scheduled","facilitated","hybrid"] as const;
function optionKey(o:{deploymentId:string;adoptionId:string;offeringVersionId:string;courseVersionId:string}){
  return [o.deploymentId,o.adoptionId,o.offeringVersionId,o.courseVersionId].join(":");
}
function toggle<T extends string>(list:T[],name:T):T[]{
  return list.includes(name)?list.filter(v=>v!==name):[...list,name];
}
function utc(value:string):string|null{return value?new Date(value).toISOString():null;}

export function NativeClassManager({preferredSiteId,preferredOfferingVersionId,navigation}: {preferredSiteId?: string;preferredOfferingVersionId?:string;navigation?:ReactNode}) {
  const client=useQueryClient();
  const [searchDraft,setSearchDraft]=useState("");
  const [search,setSearch]=useState("");
  const options=useInfiniteQuery({
    queryKey:["native-class-course-options",preferredSiteId??null,preferredOfferingVersionId??null,search],
    initialPageParam:0,
    queryFn:({pageParam})=>getUnifiedClassCourseOptions({data:{search,cursor:pageParam,
      siteId:preferredSiteId,offeringVersionId:preferredOfferingVersionId}}),
    getNextPageParam:last=>last.nextCursor??undefined,
    retry:false,
  });
  const optionsData=options.data?.pages.flatMap(page=>page.items)??[];
  const operatorSites=useQuery({
    queryKey:["native-class-operator-sites"],queryFn:()=>getNativeClassOperatorSites(),retry:false,
  });
  const classes=useQuery({queryKey:["native-class-operator-classes"],
    queryFn:()=>getMyUnifiedClassDrafts(),retry:false});
  const [choice,setChoice]=useState("");
  const [recipeText,setRecipeText]=useState("");
  const [recipeCourseId,setRecipeCourseId]=useState<string|null>(null);
  const [recipeOfferingVersionId,setRecipeOfferingVersionId]=useState<string|null>(null);
  const [recipePlan,setRecipePlan]=useState<ProgramRolloutRecipe|null>(null);
  const [rolloutSiteId,setRolloutSiteId]=useState(preferredSiteId??"");
  const exactRolloutOptions=useInfiniteQuery({
    queryKey:["native-class-rollout-options",recipePlan?.offeringVersionId,rolloutSiteId,
      recipePlan?.courses.map(course=>course.courseVersionId)],
    initialPageParam:0,
    enabled:!!recipePlan&&!!rolloutSiteId,
    queryFn:({pageParam})=>getUnifiedClassCourseOptions({data:{
      search:"",cursor:pageParam,
      offeringVersionId:recipePlan?.offeringVersionId,
      courseVersionIds:recipePlan?.courses.map(course=>course.courseVersionId),
      siteId:rolloutSiteId||undefined,
    }}),
    getNextPageParam:last=>last.nextCursor??undefined,
    retry:false,
  });
  const exactRolloutData=exactRolloutOptions.data?.pages.flatMap(page=>page.items)??[];
  const combinedOptions=[...optionsData,...exactRolloutData]
    .filter((row,index,items)=>items.findIndex(candidate=>optionKey(candidate)===optionKey(row))===index);
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
  const [createdClassId,setCreatedClassId]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const selected=combinedOptions.find(row=>optionKey(row)===choice);
  // A deep link is only a suggestion; the server independently validates
  // current Course adoption and operating Site rights on Class creation.
  const visibleOptions=combinedOptions.filter(row=>
    (!recipeCourseId||row.courseVersionId===recipeCourseId) &&
    (!recipeOfferingVersionId||row.offeringVersionId===recipeOfferingVersionId) &&
    (!preferredSiteId||row.siteOptions.some(site=>site.id===preferredSiteId)) &&
    (!preferredOfferingVersionId||row.offeringVersionId===preferredOfferingVersionId));
  const rolloutReadiness=recipePlan
    ?assessLocalRollout(recipePlan,exactRolloutData,rolloutSiteId||null):[];
  const rolloutSiteOptions=operatorSites.data??[];
  // Offering versions remain canonical publisher products. Each authorized
  // adoption may support many Course components and local Classes; no extra
  // Program records are synthesized for standalone Courses.
  const localOfferingOptions=optionsData.filter(row=>
    (!preferredSiteId||row.siteOptions.some(site=>site.id===preferredSiteId)) &&
    (!preferredOfferingVersionId||row.offeringVersionId===preferredOfferingVersionId));
  const groupKey=(row:{deploymentId:string;adoptionId:string;offeringVersionId:string})=>
    [row.deploymentId,row.adoptionId,row.offeringVersionId].join(":");
  const offeringGroups=Array.from(new Set(localOfferingOptions.map(groupKey)))
    .map(id=>{
      const rows=localOfferingOptions.filter(row=>groupKey(row)===id);
      const components=rows
        .filter((row,index)=>rows.findIndex(other=>other.courseVersionId===row.courseVersionId)===index)
        .sort((a,b)=>(a.sequenceNo??Number.MAX_SAFE_INTEGER)-(b.sequenceNo??Number.MAX_SAFE_INTEGER)||
          a.courseTitle.localeCompare(b.courseTitle));
      return {id,first:rows[0]!,components};
    });
  function chooseRolloutCourse(course:ProgramRolloutRecipe["courses"][number]){
    if(!recipePlan||!rolloutSiteId)return;
    // Select an eligible local Deployment/adoption, never a publisher supplied
    // Organization, Site or permission reference.
    const available=combinedOptions.find(row=>
      row.offeringVersionId===recipePlan.offeringVersionId &&
      row.courseVersionId===course.courseVersionId &&
      row.localClassPolicy.allowedDeliveryModes.some(mode=>mode===course.deliveryMode) &&
      row.siteOptions.some(site=>site.id===rolloutSiteId &&
        site.allowedDeliveryModes.some(mode=>mode===course.deliveryMode)));
    if(!available){setError("This Site cannot launch the selected Course and delivery mode.");return;}
    setRecipeCourseId(course.courseVersionId);
    setChoice(optionKey(available));setSiteId(rolloutSiteId);
    setTitle(available.localClassPolicy.classTitle==="locked"?available.courseTitle:course.suggestedClassTitle);
    setDeliveryMode(course.deliveryMode);
    const limit=available.localClassPolicy.maxClassCapacity;
    setClassCapacity(course.capacity===null
      ?limit===null?"":String(limit)
      :String(limit===null?course.capacity:Math.min(course.capacity,limit)));
    setCreateWithOffering(false);setError("");
    setNotice("Local adoption selected. Review Class title and terms. No Class exists until you submit the authorized create command.");
  }
  async function exportLaunchRecipe(){
    if(!selected)return;
    try{
      // The picker is bounded and may be incomplete. Re-read ALL canonical
      // Offering/Course components under the current operator/adoption grant,
      // rather than accidentally exporting a partial national Program.
      const source=await getPublisherRolloutTemplate({data:{
        deploymentId:selected.deploymentId,
        adoptionId:selected.adoptionId,
        offeringVersionId:selected.offeringVersionId,
      }});
      const plan:ProgramRolloutRecipe={
        version:2,revision:1,
        offeringVersionId:source.offeringVersionId,
        offeringTitle:source.offeringTitle,offeringKind:source.offeringKind,
        courses:source.courses.map(row=>({
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
        setNotice("Published Offering v"+source.offeringVersionNo+" rollout copied with all Course components. "+
          (source.latestPublishedVersionNo>source.offeringVersionNo
            ?"Publisher v"+source.latestPublishedVersionNo+" is available. Existing Classes stay pinned until a separately approved adoption. "
            :"")+
          "Receiving operators must independently adopt and authorize delivery.");
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
        if(!optionsData.some(row=>row.courseVersionId===recipe.courseVersionId))
          throw new Error("This Course is not currently approved for your organization. No Class was created.");
        setRecipePlan(null);setRecipeOfferingVersionId(null);
        setRecipeCourseId(recipe.courseVersionId);
        setTitle(recipe.suggestedClassTitle);
        setDeliveryMode(recipe.deliveryMode);
        setClassCapacity(recipe.capacity===null?"":String(recipe.capacity));
        setNotice("Legacy Class setup loaded. Select your organization's approved Course Offering and Site. Suggested Session duration: "+recipe.recommendedSessionMinutes+" minutes.");
      }else{
        setRecipePlan(recipe);
        setRolloutSiteId(preferredSiteId??"");
        setRecipeOfferingVersionId(recipe.offeringVersionId);
        setRecipeCourseId(null);
        setTitle("");setClassCapacity("");
        setNotice("Rollout instructions revision "+recipe.revision+" loaded for the pinned Offering version. Select each locally approved Course below. Missing adoptions require separate publisher/operator approval before any Class is created.");
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
    setCreatedClassId(null);
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
      setCreatedClassId(result.classId);
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
      <Link to="/canonical/program-operations" className="underline underline-offset-4">
        Program setup (staging)
      </Link>
      <Link to="/class" search={{view:"activities"}} className="underline underline-offset-4">
        Publisher activities
      </Link>
    </div>}>
    {navigation}
    <div className="mt-5">
      <NativeClassLaunchReadiness state={{
        operatorSites:operatorSites.status,
        authorizedSiteCount:operatorSites.data?.length??0,
        adoptedCourses:options.status,
        visibleAdoptedCourseCount:optionsData.length,
        visibleDraftClasses:classes.status,
        visibleDraftClassCount:classes.data?.length??0,
        filtered:Boolean(search||preferredSiteId||preferredOfferingVersionId),
      }}/>
    </div>
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
          <Link to="/class" search={{view:"activities"}} className="underline">Learning activities</Link>
        </div>
      </div>
      {options.isSuccess&&offeringGroups.length===0&&<p className="mt-4 text-sm text-muted-foreground">
        {search
          ?"No matching approved Courses are visible for this search. Clear the search to inspect the current operator catalog."
          :"No approved published Course adoption is visible for the current operator scope. Publisher approval and local adoption are separate."}
      </p>}
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={event=>{
        event.preventDefault();setSearch(searchDraft.trim());setChoice("");
      }}>
        <label className="min-w-[15rem] flex-1 text-sm font-semibold" htmlFor="authorized-course-search">
          Find approved Programs or Courses
          <input id="authorized-course-search" value={searchDraft}
            onChange={event=>setSearchDraft(event.target.value)} maxLength={100}
            placeholder="Course name, code, Program or Deployment"
            className="mt-1 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
        </label>
        <Button type="submit" variant="outline">Search</Button>
        {search&&<Button type="button" variant="outline"
          onClick={()=>{setSearch("");setSearchDraft("");setChoice("");}}>Clear</Button>}
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Authorized Course results are paginated. Program component counts reflect the loaded page, not the full Offering.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {offeringGroups.map(group=><article key={group.id} className="border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.first.offeringKind==="program"?"Program Offering":group.first.offeringKind==="course"?"Course Offering":"Published Offering"} · v{group.first.offeringVersionNo}
          </p>
          <h3 className="mt-1 text-base font-semibold">{group.first.offeringTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.components.length} loaded Course component(s) · {group.first.deploymentName} · Publisher content is read-only
          </p>
          <ul className="mt-3 space-y-2">
            {group.components.map(row=><li key={row.courseVersionId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-sm">
              <div>
                <p className="font-semibold">{row.courseTitle} · v{row.courseVersionNo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.isRequired?"Required":"Optional"} · {row.siteOptions.length} authorized delivery Site(s)
                </p>
                {(classes.data??[]).filter(item=>item.deploymentId===row.deploymentId&&
                  item.courseVersionId===row.courseVersionId&&
                  item.offeringVersionId===row.offeringVersionId).map(cls=>
                    <Link key={cls.classId} to="/class/$classId"
                      params={{classId:cls.classId}} search={{view:"manage",tab:"sessions"}}
                      className="mt-2 block text-xs font-semibold underline">
                      {cls.title} · {cls.state} · Sessions
                    </Link>)}
              </div>
              <Button type="button" size="sm" variant="outline"
                onClick={()=>{
                  setRecipePlan(null);setRecipeCourseId(null);setRecipeOfferingVersionId(null);
                  setChoice(optionKey(row));setTitle(row.courseTitle);
                  setClassCapacity(row.localClassPolicy.maxClassCapacity===null
                    ?"":String(row.localClassPolicy.maxClassCapacity));
                  const mode=row.localClassPolicy.allowedDeliveryModes.some(mode=>mode===deliveryMode)
                    ?deliveryMode:row.localClassPolicy.allowedDeliveryModes[0]!;
                  setDeliveryMode(mode);
                  setSiteId(preferredSiteId&&row.siteOptions.some(site=>site.id===preferredSiteId&&
                    site.allowedDeliveryModes.some(allowedMode=>allowedMode===mode))?preferredSiteId:"");
                  setNotice("Approved Course selected. Review local delivery configuration before creating a Class.");
                }}>Configure Class</Button>
            </li>)}
          </ul>
        </article>)}
      </div>
      {options.hasNextPage&&<Button type="button" variant="outline"
        disabled={options.isFetchingNextPage} className="mt-4"
        onClick={()=>void options.fetchNextPage()}>
        {options.isFetchingNextPage?"Loading…":"Load more authorized Courses"}
      </Button>}
    </section>
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
      <section className="border border-border bg-card p-5">
        <h2 className="font-serif text-2xl">Create Class</h2>
        <p className="mt-2 text-sm text-muted-foreground">Select an approved Course and authorized delivery context. The Class identity is independent of registration publication.</p>
        {options.isPending&&<p role="status" className="mt-4 text-sm">Checking available Courses and operating authorizations…</p>}
        {options.isError&&<p role="alert" className="mt-4 border border-border p-3 text-sm">The native Class service is not available for this operator or environment. No changes were made.</p>}
        {options.isSuccess&&visibleOptions.length===0&&<p role="status" className="mt-4 text-sm">
          {search?"No approved Course matching this search is visible. Clear the filter before assessing adoption.":preferredSiteId
            ?"No approved Course/Deployment is visible for this Site and current canonical grant."
            :"No approved Course/Deployment combinations are currently visible for your organization."}
        </p>}
        <section className="mt-5 border border-border bg-muted/20 p-4"
          aria-label="Network Class launch recipe">
          <h3 className="font-semibold">Prepare published Course components for local delivery</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Export exactly the published Course composition of one adopted Offering. Independent Blueprint
            activities and clubs follow their own approval lifecycle, not this Class recipe.
            Each receiving operator must separately adopt the Offering and authorize local Classes.
          </p>
          <label className="mt-3 block text-sm font-semibold" htmlFor="native-network-recipe">
            Portable publisher rollout (JSON, legacy Class recipes also accepted)
          </label>
          <textarea id="native-network-recipe" value={recipeText} rows={4}
            maxLength={24000} onChange={e=>{setRecipeText(e.target.value);
              setRecipePlan(null);setRecipeCourseId(null);setRecipeOfferingVersionId(null);
              setChoice("");setSiteId("");}}
            placeholder="Paste versioned publisher rollout instructions from an approved partner"
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
            <label className="block text-sm font-semibold" htmlFor="publisher-rollout-site">Receiving Site</label>
            {operatorSites.isError&&<p role="alert" className="text-xs">Authorized Site directory unavailable. Do not prepare a Class.</p>}
            <select id="publisher-rollout-site" value={rolloutSiteId}
              disabled={operatorSites.isPending||operatorSites.isError}
              onChange={event=>{setRolloutSiteId(event.target.value);setChoice("");setSiteId("");}}
              className="min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Select an authorized physical or virtual Site</option>
              {rolloutSiteOptions.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              Readiness uses a separate exact Offering, Course version and Site authorization query.
              No Class is created automatically; live authorization is rechecked when submitted.
              Every Class and optional Class Offering is created independently under a server-side authorization check.
            </p>
            {exactRolloutOptions.isError&&rolloutSiteId&&
              <p role="alert" className="text-sm">Could not verify rollout permissions. No Course may be prepared until the lookup succeeds.</p>}
            {exactRolloutOptions.isFetching&&
              <p role="status" className="text-xs text-muted-foreground">Checking current local adoption and Site rights…</p>}
            {recipePlan.courses.map((course,index)=>{
              const status=rolloutReadiness[index]?.status??"adoption_required";
              const incomplete=!!exactRolloutOptions.hasNextPage||exactRolloutOptions.isPending||
                exactRolloutOptions.isError||exactRolloutOptions.isFetching;
              const existingAtSite=(classes.data??[]).filter(item=>
                item.siteId===rolloutSiteId&&
                item.offeringVersionId===recipePlan.offeringVersionId&&
                item.courseVersionId===course.courseVersionId).length;
              return <div key={course.courseVersionId} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-3 text-sm">
                <div>
                  <p className="font-semibold">{course.courseTitle} {course.isRequired?"· Required":"· Optional"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status==="ready"?"Approved local adoption and Site mode found. Review staffing and terms before launch."
                      :status==="site_selection_required"?"Choose a receiving Site to check delivery permissions."
                      :status==="site_authorization_required"?"Selected Site lacks permission for this Course delivery mode."
                      :incomplete?"Checking other approved Deployment/adoption results…"
                      :"No approved adoption of this Offering version for your organization."}
                  </p>
                  {existingAtSite>0&&<p className="mt-1 text-xs text-muted-foreground">
                    At least {existingAtSite} existing Class(es) for this Course at the selected Site.
                    Preparing another is appropriate only for a distinct cohort or delivery.
                  </p>}
                </div>
                <Button type="button" variant="outline" disabled={status!=="ready"||exactRolloutOptions.isError}
                  onClick={()=>chooseRolloutCourse(course)}>
                  {existingAtSite>0?"Prepare another Class":"Prepare Class"}
                </Button>
              </div>;
            })}
            {exactRolloutOptions.hasNextPage&&<Button type="button" variant="outline"
              disabled={exactRolloutOptions.isFetchingNextPage}
              onClick={()=>void exactRolloutOptions.fetchNextPage()}>
              {exactRolloutOptions.isFetchingNextPage?"Checking…":"Check remaining authorized rollout deployments"}
            </Button>}
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
              if(selectedOption){
                setTitle(selectedOption.localClassPolicy.classTitle==="locked"
                  ?selectedOption.courseTitle:title||selectedOption.courseTitle);
                setClassCapacity(selectedOption.localClassPolicy.maxClassCapacity===null
                  ?classCapacity:String(selectedOption.localClassPolicy.maxClassCapacity));
                if(!selectedOption.localClassPolicy.allowedDeliveryModes.some(mode=>mode===deliveryMode)){
                  setDeliveryMode(selectedOption.localClassPolicy.allowedDeliveryModes[0]!);
                  setSiteId("");
                }else{
                  setSiteId(selectedOption.siteOptions.some(site=>site.id===preferredSiteId&&
                    site.allowedDeliveryModes.some(mode=>mode===deliveryMode))?preferredSiteId??"":"");
                }
              }else setSiteId("");
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
            <p className="mt-2 text-xs text-muted-foreground">
              Publisher-approved local variation: title {selected.localClassPolicy.classTitle==="locked"?"locked":"editable"};
              delivery {selected.localClassPolicy.allowedDeliveryModes.join(", ").replaceAll("_"," ")};
              {selected.localClassPolicy.maxClassCapacity!==null
                ?" maximum capacity "+selected.localClassPolicy.maxClassCapacity:" unlimited Class capacity"}.
              Publisher curriculum, grading and assessments remain locked.
            </p>
            <p className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
              <Link to="/canonical/lab/deployments" className="underline">Deployment and adoption</Link>
              <Link to="/operations/curriculum" className="underline">Curriculum</Link>
              <Link to="/class" search={{view:"activities",courseVersionId:selected.courseVersionId}} className="underline">Course activities</Link>
            </p>
          </aside>}
          <div><label className="block text-sm font-semibold" htmlFor="native-class-title">Class name</label>
            <input id="native-class-title" required minLength={3} maxLength={200} value={title}
              disabled={selected?.localClassPolicy.classTitle==="locked"}
              onChange={e=>setTitle(e.target.value)} placeholder="AI Literacy · January 2027"
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="native-class-overall-capacity">
              Class capacity
            </label>
            <input id="native-class-overall-capacity" type="number" min={1}
              max={selected?.localClassPolicy.maxClassCapacity??undefined}
              value={classCapacity} placeholder="Unlimited"
              onChange={event=>setClassCapacity(event.target.value)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm"/>
            <p className="mt-2 text-xs text-muted-foreground">
              {selected?.localClassPolicy.maxClassCapacity!==null&&selected&&
                "Publisher maximum: "+selected.localClassPolicy.maxClassCapacity+". An unlimited Class is not permitted. "}
              This is the total number of seats in the Class across every enrollment method.
              A Class Offering may impose an additional, lower registration limit.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-semibold" htmlFor="native-class-mode">Delivery</label>
              <select id="native-class-mode" value={deliveryMode} onChange={e=>{
                const mode=e.target.value as typeof deliveryMode;
                setDeliveryMode(mode);
                if(!selected?.siteOptions.some(site=>site.id===siteId&&
                    site.allowedDeliveryModes.some(allowedMode=>allowedMode===mode)))setSiteId("");
              }}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
                {deliveryOptions.filter(mode=>!selected||selected.localClassPolicy.allowedDeliveryModes.some(allowedMode=>allowedMode===mode))
                  .map(mode=><option key={mode} value={mode}>{mode.replace("_"," ")}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-semibold" htmlFor="native-class-site">Site</label>
              <select id="native-class-site" value={siteId} required
                onChange={e=>setSiteId(e.target.value)}
                className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
                <option value="">Select an approved physical or virtual Site</option>
                {(selected?.siteOptions??[]).filter(site=>site.allowedDeliveryModes.some(mode=>mode===deliveryMode))
                  .map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            All launched Classes require an approved canonical physical or virtual Site,
            including self-paced delivery. An unassigned draft cannot be activated.
          </p>
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
          <Button disabled={busy||!selected||!siteId||(createWithOffering&&(methods.length===0||creditModes.length===0))} type="submit">
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
            <h3 className="mt-1 text-base font-semibold"><Link to="/class/$classId"
              params={{classId:item.classId}} search={{view:"manage",tab:"overview"}}
              className="underline-offset-2 hover:underline">{item.title}</Link></h3>
            <p className="mt-2 text-xs text-muted-foreground">{item.deliveryMode.replace("_"," ")} · {(item.enrollmentMethods??[]).join(", ")||"No registration publication"}</p>
            <Link to="/class/$classId" params={{classId:item.classId}} search={{view:"manage",tab:"overview"}}
              className="mt-2 inline-block text-sm font-semibold underline">Open Class workspace</Link>
            <Link to="/class/$classId" params={{classId:item.classId}} search={{view:"manage",tab:"reports"}}
              aria-label={`Class evidence for ${item.title}`}
              className="mt-2 ml-3 inline-block text-sm font-semibold underline">Class evidence</Link>
            {item.state!=="active"&&<Button disabled={busy||!item.siteId} className="mt-3 mr-2" onClick={()=>void activate(item.classId)}>Activate Class</Button>}
            {!item.siteId&&<p className="mt-2 text-xs text-muted-foreground">No assigned canonical Site. This draft cannot be activated or published.</p>}
            {!item.classOfferingVersionId&&<Button disabled={busy||methods.length===0||creditModes.length===0} className="mt-3 mr-2" variant="outline"
              onClick={()=>void addOffering(item.classId)}>Create draft Offering from form terms</Button>}
            {item.offeringState==="draft"&&item.classOfferingVersionId&&<Button disabled={busy} className="mt-3"
              onClick={()=>void action(item.classId,item.classOfferingVersionId!,"publish")}>Publish Class Offering</Button>}
            {item.offeringState==="published"&&item.classOfferingVersionId&&<Button disabled={busy} className="mt-3" variant="outline"
              onClick={()=>void action(item.classId,item.classOfferingVersionId!,"close")}>Close enrollment</Button>}
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
    {createdClassId&&<Link to="/class/$classId" params={{classId:createdClassId}}
      search={{view:"manage",tab:"overview"}}
      className="mt-3 inline-flex min-h-11 items-center border border-border bg-card px-4 py-3 text-sm font-semibold text-primary">
      Open newly created Class
    </Link>}
    {error&&<p role="alert" className="mt-5 border border-border bg-card p-4 text-sm">{error}</p>}
  </WorkspaceShell>;
}
