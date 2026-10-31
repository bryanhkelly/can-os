import { encodeCommonCartridge } from "@/components/learning/common-cartridge-encoding";
import { CommonCartridgeValidationSummary } from "@/components/learning/CommonCartridgeValidationSummary";
import { OneRosterClassMappingFields } from "@/components/learning/OneRosterClassMappingFields";
import { CurriculumPdfPicker } from "@/components/learning/CurriculumPdfPicker";
import { CurriculumCourseOutline } from "@/components/learning/CurriculumCourseOutline";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { schoolCurriculumNextActions } from "@/domain/curriculum-next-actions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getCurriculumMarketplace, getCurriculumAdopterPrograms, getCurriculumJourneyReadiness, installCurriculumPack, adoptCurriculumPack, addMarketplaceSupplement } from "@/modules/learning/curriculum-marketplace.functions";
import { beginCurriculumPdfUpload, finishCurriculumPdfUpload, curriculumPdfUploadAvailability } from "@/modules/learning/curriculum-resource-upload.functions";
import { validateCommonCartridgeImport, importCommonCartridgeSectionLinks, listCommonCartridgeImports, beginCommonCartridgeStaticLessonImport, finishCommonCartridgeStaticLessonImport } from "@/modules/learning/common-cartridge-import.functions";
import { exportOneRosterBulkRoster } from "@/modules/learning/oneroster-export.functions";
import { validateOneRosterCsvBundle, applyOneRosterClassMappings } from "@/modules/learning/oneroster-import.functions";
import { CurriculumProgramNavigation } from "@/components/learning/CurriculumProgramNavigation";
import { previewRosterClasses } from "@/components/learning/oneroster-class-preview";

const searchSchema=z.object({programId:z.string().uuid().optional()});
export const Route=createFileRoute("/operations/curriculum-marketplace")({
 validateSearch:(search:Record<string,unknown>)=>searchSchema.parse(search),
 loaderDeps:({search})=>({programId:search.programId}),
 loader:({deps})=>safeLoader(async()=>{
  const programs=await getCurriculumAdopterPrograms();
  const marketplace=deps.programId?await getCurriculumMarketplace({data:{programId:deps.programId}}):null;
  return {
   programs,marketplace,
   journey:deps.programId?await getCurriculumJourneyReadiness({data:{programId:deps.programId}}):null,
   pdfUpload:await curriculumPdfUploadAvailability().catch(()=>({enabled:false})),
   imports:deps.programId&&marketplace?.canPublish
    ?await listCommonCartridgeImports({data:{programId:deps.programId}}):[],
  };
 },{authMessage:"An authorized school curriculum adopter or publisher is required."})(),
 component:CurriculumMarketplacePage,
});
type Market=Awaited<ReturnType<typeof getCurriculumMarketplace>>;
function CurriculumMarketplacePage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Curriculum Marketplace" outcome={outcome}/>;
 return <MarketView key={outcome.data.marketplace?.program.id??"none"} data={outcome.data}/>;
}
function MarketView({data}:{data:{programs:Awaited<ReturnType<typeof getCurriculumAdopterPrograms>>;marketplace:Market|null;journey:Awaited<ReturnType<typeof getCurriculumJourneyReadiness>>|null;pdfUpload:{enabled:boolean};imports:Awaited<ReturnType<typeof listCommonCartridgeImports>>}}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [accepted,setAccepted]=useState<Record<string,boolean>>({});
 const [adoptionReview,setAdoptionReview]=useState<string|null>(null);
 const [adoptionConfirmed,setAdoptionConfirmed]=useState<Record<string,boolean>>({});
 const [courseVersionId,setCourseVersionId]=useState(""),[scope,setScope]=useState<"program"|"site"|"section">("site");
 const [sectionId,setSectionId]=useState(""),[lessonId,setLessonId]=useState("");
 const [title,setTitle]=useState(""),[kind,setKind]=useState<"link"|"video"|"pdf"|"image"|"audio"|"document">("link"),[url,setUrl]=useState("");
 const [pdfFile,setPdfFile]=useState<File|null>(null),[rightsConfirmed,setRightsConfirmed]=useState(false);
 const [pdfKey,setPdfKey]=useState(0);
 const [cartridgeFile,setCartridgeFile]=useState<File|null>(null);
 const [cartridgeReport,setCartridgeReport]=useState<Awaited<ReturnType<typeof validateCommonCartridgeImport>>|null>(null);
 const [cartridgeSection,setCartridgeSection]=useState(""),[cartridgeLinks,setCartridgeLinks]=useState<string[]>([]);
 const [cartridgeRights,setCartridgeRights]=useState(false);
 const [htmlIdentifier,setHtmlIdentifier]=useState(""),[htmlLicense,setHtmlLicense]=useState(""),[htmlAttribution,setHtmlAttribution]=useState("");
 const [rosterSource,setRosterSource]=useState(""),[rosterCsv,setRosterCsv]=useState("");
 const [rosterValidated,setRosterValidated]=useState(false);
 const [rosterMap,setRosterMap]=useState<Record<string,string>>({});
 const cartridgeWebLinks=cartridgeReport?.preview.resources.filter(r=>/weblink|imswl/i.test(r.type))??[];
 const cartridgeStaticHtml=cartridgeReport?.preview.resources.filter(r=>/^(webcontent|imscc_xmlv1p3\\/webcontent)$/i.test(r.type)&&r.href?.match(/\\.html?$/i)&&r.files.length===1&&r.files[0]===r.href)??[];
 const rosterClasses=previewRosterClasses(rosterCsv);
 const market=data.marketplace;
 async function perform(task:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{await task();await router.invalidate();setNotice(success);}
  catch(e){setError(e instanceof Error?e.message:"Unable to save curriculum change.");}
  finally{setBusy(false);}
 }
 const installed=market?.packs.filter(pack=>pack.entitlement==="active")??[];
 const adopted=installed.filter(pack=>pack.adoption?.status==="active" && pack.adoption.versionId===pack.versionId);
 const choices=adopted.flatMap(pack=>pack.courses.map(course=>({...course,pack:pack.name})));
 const chosenSections=market?.sections.filter(section=>section.courseVersionId===courseVersionId)??[];
 const nextActions=data.journey?schoolCurriculumNextActions({
  installedPacks:data.journey.totals.packsInstalled,
  adoptedPacks:data.journey.totals.packsAdopted,
  adoptedCourseVersions:data.journey.totals.courseVersionsAvailable,
  classes:data.journey.classes,
 }):[];
 return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Academic operations</p>
  <h1 className="font-serif text-4xl">Curriculum Marketplace</h1>
  <p className="max-w-3xl text-sm text-muted-foreground">Install published curriculum packs into your organization's library, adopt releases for a school program and supplement classes without changing the publisher's immutable material.</p>
  <CurriculumProgramNavigation programs={data.programs} selectedProgramId={market?.program.id} canPublish={Boolean(market?.canPublish)} />
  {error&&<p role="alert" className="rounded-lg border border-red-500 p-4 text-sm">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border p-4 text-sm">{notice}</p>}
  {!market&&<p className="rounded-lg border p-4">Select a program to browse packs under its verified school membership.</p>}
  {market&&<>
   {data.journey&&<section className="space-y-4 rounded-xl border bg-card p-5" aria-label="School curriculum next actions">
    <div>
      <h2 className="font-serif text-2xl">School curriculum next actions</h2>
      <p className="text-sm text-muted-foreground">Suggested next steps from current school records. They do not establish academic approval or end-to-end test completion.</p>
    </div>
    {nextActions.length?<ol className="space-y-2">{nextActions.map((action,index)=><li key={action.key} className="flex flex-wrap items-start justify-between gap-3 rounded border p-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{index+1}. {action.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{action.detail}</p>
      </div>
      {action.destination==="packs"?<a href="#curriculum-packs" className="text-sm underline">Browse curriculum packs</a>:
       action.destination==="launch"?<Link to="/operations/launch/$programId" params={{programId:market.program.id}} className="text-sm underline">Open class setup</Link>:null}
    </li>)}</ol>:<p className="text-sm">No immediate gaps detected in the tracked curriculum handoffs. Continue monitoring instruction and student evidence; this is not an acceptance-test result.</p>}
   </section>}
   {data.journey&&<section className="space-y-4 rounded-xl border bg-card p-5" aria-label="Curriculum operational evidence">
    <div>
     <h2 className="font-serif text-2xl">Curriculum journey: operational evidence</h2>
     <p className="text-sm text-muted-foreground">Read-only counts from this program's real adopted curriculum, sections and assessed student work. These are not proof that signed-in end-to-end acceptance tests have passed.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
     {([
      ["Installed packs",data.journey.totals.packsInstalled],
      ["Adopted packs",data.journey.totals.packsAdopted],
      ["Adopted course versions",data.journey.totals.courseVersionsAvailable],
      ["Classes using adopted courses",data.journey.totals.classesUsingAdoptedCourses],
      ["Classes with published lessons",data.journey.totals.classesWithLessons],
      ["Classes with an assigned teacher",data.journey.totals.classesWithTeachers],
      ["Classes with enrolled students",data.journey.totals.classesWithStudents],
      ["Classes with published assignments",data.journey.totals.classesWithAssignments],
      ["Submitted responses",data.journey.totals.studentSubmissions],
      ["Graded responses",data.journey.totals.gradedSubmissions],
     ] as [string,number][]).map(([label,value])=><div key={label} className="rounded border p-3">
      <p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p>
     </div>)}
    </div>
    <Link to="/operations/launch/$programId" params={{programId:market.program.id}} className="inline-block text-sm underline">Provision and staff classes for this program →</Link>
    <h3 className="text-sm font-semibold">Classes using adopted publisher courses</h3>
    {data.journey.classes.map(klass=><div key={klass.id} className="rounded border p-3 text-sm">
     <p className="font-semibold">{klass.code} · {klass.title}</p>
     <p>{klass.publishedLessonCount} lessons · {klass.teacherCount} teachers · {klass.studentCount} students · {klass.assignedAssessmentCount} published assessments · {klass.submittedAttemptCount} submitted responses · {klass.gradedAttemptCount} graded</p>
     <p className="mt-1 text-xs text-muted-foreground">For classroom verification, switch to an assigned teacher or enrolled student account before opening the class.</p>
     <Link to="/classes" search={{section:klass.id}} className="text-sm underline">Open class as an authorized member →</Link>
    </div>)}
    {!data.journey.classes.length&&<p className="text-sm">No classes use currently adopted publisher course releases. Provision a class after adopting a pack.</p>}
    <p className="text-xs text-muted-foreground">To certify the workflow, run the isolated database acceptance suite and signed-in browser tests. Nonzero counts establish operational records only.</p>
   </section>}
   <section id="curriculum-packs" className="space-y-3">
    <h2 className="font-serif text-2xl">Available curriculum packs</h2>
    <div className="grid gap-4 md:grid-cols-2">
     {market.packs.map(pack=><article key={pack.versionId} className="space-y-3 rounded-xl border bg-card p-5">
       <p className="text-xs uppercase tracking-wide text-muted-foreground">Version {pack.version} · {pack.licenseCode} · Published by {pack.publisherName}</p>
       <h3 className="font-serif text-2xl">{pack.name}</h3>
       <p className="text-sm text-muted-foreground">{pack.description}</p>
       <p className="text-sm">{pack.courses.length} published course versions</p>
       <CurriculumCourseOutline courses={pack.courses} />
       {pack.entitlement && pack.entitlement!=="active"?
        <p role="status" className="text-sm text-muted-foreground">License status: {pack.entitlement}. Publisher review is required to restore this organization's entitlement. Accepting terms again cannot reactivate it.</p>:
        pack.entitlement!=="active"?<>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted[pack.id]??false}
         onChange={e=>setAccepted(old=>({...old,[pack.id]:e.target.checked}))}/>
         <span>I accept this pack's {pack.licenseCode} terms and understand that commercial or third-party rights require a verified agreement.</span>
        </label>
        <button type="button" disabled={busy||!accepted[pack.id]} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
         onClick={()=>perform(()=>installCurriculumPack({data:{programId:market.program.id,packId:pack.id,termsAccepted:true}}),"Pack added to your organization's library.")}>Add to library</button>
       </>:pack.adoption?.status==="active" && pack.adoption.versionId===pack.versionId?
        <p className="text-sm font-medium">Release v{pack.version} adopted for {market.program.name}</p>:
        pack.adoption?.status==="active"?
        <p className="text-sm text-muted-foreground">Installed; a different release of this pack is already adopted. Upgrades must be reviewed to preserve class progress.</p>:
        pack.adoption?
        <p role="status" className="text-sm text-muted-foreground">Program adoption status: {pack.adoption.status}. An explicit adoption revision is required before this pack can be used again. Existing class version pins and local supplements are preserved.</p>:
        <section className="space-y-3 rounded border p-3" aria-label={"Review adoption for "+pack.name}>
         {adoptionReview!==pack.versionId?<button type="button" disabled={busy}
           className="rounded border px-3 py-2 text-sm" onClick={()=>setAdoptionReview(pack.versionId)}>Review adoption</button>:<>
          <h4 className="font-semibold text-sm">Confirm curriculum adoption</h4>
          <dl className="grid gap-1 text-sm">
           <div><dt className="inline text-muted-foreground">School program: </dt><dd className="inline font-medium">{market.program.name}</dd></div>
           <div><dt className="inline text-muted-foreground">Publisher: </dt><dd className="inline font-medium">{pack.publisherName}</dd></div>
           <div><dt className="inline text-muted-foreground">Pack: </dt><dd className="inline">{pack.name}, release v{pack.version}</dd></div>
           <div><dt className="inline text-muted-foreground">License classification: </dt><dd className="inline">{pack.licenseCode}</dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">Included publisher course releases: {pack.courses.map(c=>`${c.code} (${c.title})`).join(" · ")}.</p>
          <p className="text-xs text-muted-foreground">This pins this publisher pack to the selected program. Existing class versions will not change. Academic-year-specific adoption is not yet available; license classification alone is not an executed commercial agreement.</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox"
            checked={adoptionConfirmed[pack.versionId]??false}
            onChange={e=>setAdoptionConfirmed(v=>({...v,[pack.versionId]:e.target.checked}))}/>
            <span>I reviewed the publisher, exact release, included courses, program, and license conditions.</span>
          </label>
          <div className="flex flex-wrap gap-3">
           <button type="button" disabled={busy||!adoptionConfirmed[pack.versionId]}
            className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
            onClick={()=>perform(()=>adoptCurriculumPack({data:{programId:market.program.id,packId:pack.id,versionId:pack.versionId}}),"Published pack release adopted by this program.")}>Adopt for this program</button>
           <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>{setAdoptionReview(null);setAdoptionConfirmed(v=>({...v,[pack.versionId]:false}));}}>Cancel</button>
          </div>
         </>}
        </section>}
      </article>)}
    </div>
    {!market.packs.length&&<p className="rounded border p-4 text-sm">No published curriculum packs are available to this organization yet.</p>}
   </section>
   <section className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Supplement adopted curriculum</h2>
    <p className="text-sm text-muted-foreground">Add videos, PDFs hosted at an HTTPS address, websites or other resources. Publisher course versions remain unchanged; approved additions are tracked separately by program, site or class.</p>
    {!choices.length?<p className="text-sm">Install and adopt a pack before adding resources.</p>:
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void perform(async()=>{
      await addMarketplaceSupplement({data:{
       programId:market.program.id,courseVersionId,scope,
       ...(scope==="section"?{sectionId}:{}),...(lessonId.trim()?{lessonId:lessonId.trim()}:{}),
       title,kind,url,
      }});
      setTitle("");setUrl("");setLessonId("");
     },"Supplement added to the selected curriculum scope.");}}>
     <label className="text-sm">Course<select required className="mt-1 block w-full rounded border bg-background p-2" value={courseVersionId}
       onChange={e=>{setCourseVersionId(e.target.value);setSectionId("");}}>
       <option value="">Select a course</option>{choices.map(c=><option value={c.courseVersionId} key={c.courseVersionId}>{c.code} · {c.title}</option>)}
      </select></label>
     <label className="text-sm">Visibility<select className="mt-1 block w-full rounded border bg-background p-2" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}>
      <option value="program">Entire program</option><option value="site" disabled={!market.program.siteId}>Current school site</option><option value="section">One class section</option>
     </select></label>
     {scope==="section"&&<label className="text-sm">Class section<select required className="mt-1 block w-full rounded border bg-background p-2" value={sectionId} onChange={e=>setSectionId(e.target.value)}>
      <option value="">Select class</option>{chosenSections.map(s=><option value={s.id} key={s.id}>{s.title}</option>)}
     </select></label>}
     <label className="text-sm">Lesson ID (optional)<input className="mt-1 block w-full rounded border bg-background p-2" value={lessonId} onChange={e=>setLessonId(e.target.value)} placeholder="Publisher lesson ID"/></label>
     <label className="text-sm">Resource title<input required minLength={3} maxLength={200} className="mt-1 block w-full rounded border bg-background p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
     <label className="text-sm">Resource format<select className="mt-1 block w-full rounded border bg-background p-2" value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>
      {["link","video","pdf","image","audio","document"].map(k=><option key={k} value={k}>{k}</option>)}
     </select></label>
     <label className="text-sm sm:col-span-2">HTTPS resource URL<input required type="url" maxLength={2048} className="mt-1 block w-full rounded border bg-background p-2" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/></label>
     <button disabled={busy||!courseVersionId||(scope==="section"&&!sectionId)} className="justify-self-start rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">Add supplement</button>
     <fieldset className="sm:col-span-2 space-y-3 rounded-lg border p-4">
      <legend className="px-2 text-sm font-semibold">Upload a private PDF</legend>
      <CurriculumPdfPicker enabled={data.pdfUpload.enabled} busy={busy} fileKey={pdfKey}
       selectedFile={pdfFile} rightsConfirmed={rightsConfirmed}
       onFileChange={setPdfFile} onRightsChange={setRightsConfirmed} />
      <button type="button" disabled={busy||!data.pdfUpload.enabled||!pdfFile||!rightsConfirmed||!courseVersionId||
          !title.trim()||(scope==="section"&&!sectionId)}
       className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
       onClick={()=>void perform(async()=>{
         if(!pdfFile)throw new Error("Select a PDF.");
         if(pdfFile.size<16||pdfFile.size>10*1024*1024)throw new Error("PDF must be between 16 bytes and 10 MB.");
         const params={programId:market.program.id,courseVersionId,scope,title,
           ...(scope==="section"?{sectionId}:{}),
           ...(lessonId.trim()?{lessonId:lessonId.trim()}:{}),
           fileName:pdfFile.name,size:pdfFile.size};
         const signed=await beginCurriculumPdfUpload({data:params});
         const uploaded=await fetch(signed.uploadUrl,{
           method:"PUT",headers:{"Content-Type":"application/pdf","If-None-Match":"*"},
           body:pdfFile,
         });
         if(!uploaded.ok)throw new Error("Private PDF upload failed. No curriculum resource was created.");
         await finishCurriculumPdfUpload({data:{...params,
           resourceId:signed.resourceId,key:signed.key,acknowledgedRights:true}});
         setPdfFile(null);setPdfKey(v=>v+1);setRightsConfirmed(false);
       },"Private PDF uploaded and attached to the selected curriculum scope.")}>Upload PDF</button>
      {!data.pdfUpload.enabled&&<p className="text-xs text-muted-foreground" role="status">
        Private PDF uploads require CAN_R2_CURRICULUM_UPLOADS_ENABLED=true and a configured private R2 bucket. External HTTPS PDF links remain available above.</p>}
     </fieldset>
    </form>}
    <h3 className="font-semibold">Current supplements</h3>
    <ul className="space-y-2 text-sm">{market.overlays.map(item=><li className="rounded border p-3" key={item.id}>
     <strong>{item.title}</strong> · {item.kind} · {item.sectionId?"Class":item.siteId?"Site":"Program"} ·
     {item.url&&<a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-1 underline">Open</a>}
    </li>)}</ul>
    {!market.overlays.length&&<p className="text-sm text-muted-foreground">No supplemental materials yet.</p>}
   </section>

   {market.canPublish&&<section className="space-y-3 rounded-xl border p-5">
     <h2 className="font-serif text-2xl">Import Common Cartridge</h2>
     <p className="text-sm text-muted-foreground">Inspect a publisher-supplied 1EdTech Common Cartridge or Thin Common Cartridge (.imscc) without rebuilding it manually. The first stage validates the ZIP manifest, preserves publisher IDs and reports unsupported assessment or application resources. It does not yet publish a course or import embedded files.</p>
     <label className="block text-sm">Cartridge package (.imscc, 2 MB maximum)
       <input type="file" accept=".imscc,.zip" disabled={busy} className="mt-2 block"
         onChange={e=>{setCartridgeReport(null);setCartridgeLinks([]);setCartridgeSection("");setCartridgeRights(false);setCartridgeFile(e.currentTarget.files?.[0]??null);}}/>
     </label>
     <button type="button" disabled={busy||!cartridgeFile}
       className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
       onClick={()=>void perform(async()=>{
        if(!cartridgeFile)throw new Error("Select a Common Cartridge file.");
        const base64=await encodeCommonCartridge(cartridgeFile);
        const result=await validateCommonCartridgeImport({data:{
          programId:market.program.id,fileName:cartridgeFile.name,base64,
        }});
        setCartridgeReport(result);
       },"Cartridge manifest validated and audit-staged. Review the notices before publishing any content.")}>
       Validate cartridge
     </button>
     {cartridgeReport&&<CommonCartridgeValidationSummary report={cartridgeReport} />}
      {cartridgeReport&&cartridgeWebLinks.length>0&&<section className="space-y-3 rounded border p-4" aria-label="Import supported Common Cartridge web links">
       <h3 className="font-semibold">Add supported web links to a class</h3>
       <p className="text-xs text-muted-foreground">Select the original external links you reviewed. Their URLs and source identifiers are preserved in canonical curriculum resources; this does not import a course or lesson package.</p>
       <label className="block text-sm">Destination class
        <select className="mt-1 block w-full rounded border bg-background p-2" value={cartridgeSection} onChange={e=>setCartridgeSection(e.target.value)}>
         <option value="">Select a class</option>
         {market.sections.map(section=><option key={section.id} value={section.id}>{section.code} · {section.title}</option>)}
        </select>
       </label>
       <div className="space-y-2">{cartridgeWebLinks.map(link=><label key={link.identifier} className="flex items-start gap-2 text-sm">
         <input type="checkbox" checked={cartridgeLinks.includes(link.identifier)}
          onChange={e=>setCartridgeLinks(old=>e.target.checked?[...old,link.identifier]:old.filter(id=>id!==link.identifier))}/>
         <span>{link.identifier} · {link.href??link.files[0]??"Link descriptor"}</span>
       </label>)}</div>
       <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={cartridgeRights}
        onChange={e=>setCartridgeRights(e.target.checked)}/>
        <span>I reviewed these external links, their destination class, and rights to share them with students.</span>
       </label>
       <button type="button" className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={busy||!cartridgeFile||!cartridgeSection||!cartridgeRights||!cartridgeLinks.length}
        onClick={()=>void perform(async()=>{
         if(!cartridgeFile)throw new Error("Select the validated source package.");
         const base64=await encodeCommonCartridge(cartridgeFile);
         await importCommonCartridgeSectionLinks({data:{
           programId:market.program.id,sectionId:cartridgeSection,fileName:cartridgeFile.name,
           base64,linkIdentifiers:cartridgeLinks,rightsConfirmed:true,
         }});
        },"Selected web links added to the class as canonical curriculum resources.")}>Add selected links to class</button>
      </section>}
     {cartridgeReport&&cartridgeStaticHtml.length>0&&<section className="space-y-3 rounded border p-4" aria-label="Import Common Cartridge static HTML lesson">
      <h3 className="font-semibold">Import static HTML lesson</h3>
      <p className="text-xs text-muted-foreground">Only single-file, text-only HTML is accepted. Scripts, linked assets, assessments and application launches are not imported.</p>
      <label className="block text-sm">Lesson resource
       <select className="mt-1 block w-full rounded border p-2" value={htmlIdentifier} onChange={e=>setHtmlIdentifier(e.target.value)}>
        <option value="">Select a lesson</option>
        {cartridgeStaticHtml.map(item=><option key={item.identifier} value={item.identifier}>{item.identifier} · {item.href}</option>)}
       </select>
      </label>
      <label className="block text-sm">License code<input className="mt-1 block w-full rounded border p-2" value={htmlLicense} onChange={e=>setHtmlLicense(e.target.value)} maxLength={80} placeholder="Publisher license identifier" /></label>
      <label className="block text-sm">Publisher attribution<input className="mt-1 block w-full rounded border p-2" value={htmlAttribution} onChange={e=>setHtmlAttribution(e.target.value)} maxLength={500} /></label>
      <p className="text-xs">Destination class: {market.sections.find(section=>section.id===cartridgeSection)?.title??"Select a destination class in the web-link section above."}</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={cartridgeRights} onChange={e=>setCartridgeRights(e.target.checked)}/>I confirm that the license permits distribution to this class.</label>
      <button type="button" className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
       disabled={busy||!cartridgeFile||!cartridgeSection||!htmlIdentifier||!cartridgeRights||htmlLicense.trim().length<2||!htmlAttribution.trim()}
       onClick={()=>void perform(async()=>{
        if(!cartridgeFile)throw new Error("Select the validated cartridge.");
        const base64=await encodeCommonCartridge(cartridgeFile);
        const input={programId:market.program.id,sectionId:cartridgeSection,
         fileName:cartridgeFile.name,base64,resourceIdentifier:htmlIdentifier,
         rightsConfirmed:true as const,licenseCode:htmlLicense,attribution:htmlAttribution};
        const pending=await beginCommonCartridgeStaticLessonImport({data:input});
        const binary=atob(pending.content),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        const uploaded=await fetch(pending.uploadUrl,{method:"PUT",headers:{"Content-Type":"text/html","If-None-Match":"*"},body:bytes});
        if(!uploaded.ok)throw new Error("Private HTML upload failed.");
        await finishCommonCartridgeStaticLessonImport({data:{...input,resourceId:pending.resourceId,
         key:pending.key,htmlSha256:pending.htmlSha256}});
       },"Static HTML lesson imported into the selected class.")}>Import selected static lesson</button>
     </section>}
     <h3 className="font-semibold">Recent validation jobs</h3>
     <ul className="space-y-1 text-sm">{data.imports.map(item=><li key={item.id}>
       {item.sourceName} · {item.format.replaceAll("_"," ")} · {item.status} · {item.resourceCount} resources · {item.noticeCount} notices
     </li>)}</ul>
     {!data.imports.length&&<p className="text-sm text-muted-foreground">No Common Cartridge imports have been staged for this organization.</p>}
   </section>}

   <section className="space-y-3 rounded-xl border p-5">
     <h2 className="font-serif text-2xl">OneRoster 1.2 school exchange</h2>
     <p className="text-sm text-muted-foreground">
       Export the active program's classes, students and teachers as a ZIP containing OneRoster 1.2 bulk roster CSVs.
       This export contains identifiable student and teacher information and requires the school's separate registrar
       enrollment-approval authority. Gradebook result exchange and roster import are not yet enabled.
     </p>
     <button type="button" disabled={busy} className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      onClick={()=>void perform(async()=>{
        const archive=await exportOneRosterBulkRoster({data:{programId:market.program.id}});
        const binary=atob(archive.base64),bytes=new Uint8Array(binary.length);
        for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
        const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type:"application/zip"}));
        const a=document.createElement("a");a.href=url;a.download=archive.fileName;
        document.body.appendChild(a);a.click();a.remove();
        URL.revokeObjectURL(url);
      },"OneRoster roster export generated and access logged.")}>Export OneRoster ZIP</button>
     <p className="text-xs text-muted-foreground">
       Only active, explicitly authorized sections and their enrolled students and assigned teachers are included.
       This is a roster-profile implementation, not a claim of complete OneRoster or gradebook conformance.
     </p>
   </section>
   {market.canPublish&&<section className="space-y-3 rounded-xl border p-5" aria-label="Reconcile OneRoster classes">
     <h2 className="font-serif text-2xl">Match OneRoster classes</h2>
     <p className="text-sm text-muted-foreground">Paste a OneRoster 1.2 classes.csv to connect external sourced IDs to existing CAN classes. No child profiles, enrollments, teacher accounts or grades are changed. Match every class explicitly and review the destination before saving.</p>
     <label className="block text-sm">Source system
      <input className="mt-1 block w-full rounded border bg-background p-2" value={rosterSource}
       placeholder="district-sis" maxLength={100} onChange={e=>{setRosterSource(e.target.value);setRosterValidated(false);}}/>
     </label>
     <label className="block text-sm">OneRoster classes.csv
      <textarea className="mt-1 block min-h-28 w-full rounded border bg-background p-2 font-mono text-xs"
       value={rosterCsv} maxLength={500000}
       placeholder={"sourcedId,title,courseSourcedId,classCode,schoolSourcedId"}
       onChange={e=>{setRosterCsv(e.target.value);setRosterValidated(false);setRosterMap({});}}/>
     </label>
     <button type="button" className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
      disabled={busy||!rosterSource.trim()||!rosterCsv.trim()||!rosterClasses.length||rosterClasses.length>500}
      onClick={()=>void perform(async()=>{
       const result=await validateOneRosterCsvBundle({data:{programId:market.program.id,files:{classes:rosterCsv}}});
       if(!result.report.valid)throw new Error("The OneRoster CSV contains validation errors.");
       setRosterValidated(true);
      },"OneRoster classes validated. Choose the corresponding CAN classes.")}>Validate class CSV</button>
     {rosterValidated&&<OneRosterClassMappingFields rows={rosterClasses} sections={market.sections}
      mappings={rosterMap} busy={busy}
      onMappingChange={(sourcedId,sectionId)=>setRosterMap(old=>({...old,[sourcedId]:sectionId}))}
      onSave={()=>void perform(async()=>{
       await applyOneRosterClassMappings({data:{programId:market.program.id,
        sourceSystem:rosterSource,files:{classes:rosterCsv},
        classMappings:rosterClasses.map(row=>({sourcedId:row.sourcedId,sectionId:rosterMap[row.sourcedId]!}))}});
      },"External OneRoster class identities reconciled to canonical CAN Sections.")} />}
     <p className="text-xs text-muted-foreground">This scoped class-reconciliation workflow is not a student roster import or OneRoster certification.</p>
    </section>}
  </>}
 </main>;
}
