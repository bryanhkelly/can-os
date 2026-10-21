import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getCurriculumPrograms } from "@/modules/learning/curriculum-authoring.functions";
import { getCurriculumMarketplace, installCurriculumPack, adoptCurriculumPack, addMarketplaceSupplement } from "@/modules/learning/curriculum-marketplace.functions";
import { beginCurriculumPdfUpload, finishCurriculumPdfUpload, curriculumPdfUploadAvailability } from "@/modules/learning/curriculum-resource-upload.functions";

const searchSchema=z.object({programId:z.string().uuid().optional()});
export const Route=createFileRoute("/operations/curriculum-marketplace")({
 validateSearch:(search:Record<string,unknown>)=>searchSchema.parse(search),
 loaderDeps:({search})=>({programId:search.programId}),
 loader:({deps})=>safeLoader(async()=>({
  programs:await getCurriculumPrograms(),
  marketplace:deps.programId?await getCurriculumMarketplace({data:{programId:deps.programId}}):null,
  pdfUpload:await curriculumPdfUploadAvailability().catch(()=>({enabled:false})),
 }),{authMessage:"An authorized institutional curriculum publisher is required."})(),
 component:CurriculumMarketplacePage,
});
type Market=Awaited<ReturnType<typeof getCurriculumMarketplace>>;
function CurriculumMarketplacePage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Curriculum Marketplace" outcome={outcome}/>;
 return <MarketView key={outcome.data.marketplace?.program.id??"none"} data={outcome.data}/>;
}
function MarketView({data}:{data:{programs:Awaited<ReturnType<typeof getCurriculumPrograms>>;marketplace:Market|null;pdfUpload:{enabled:boolean}}}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [accepted,setAccepted]=useState<Record<string,boolean>>({});
 const [courseVersionId,setCourseVersionId]=useState(""),[scope,setScope]=useState<"program"|"site"|"section">("site");
 const [sectionId,setSectionId]=useState(""),[lessonId,setLessonId]=useState("");
 const [title,setTitle]=useState(""),[kind,setKind]=useState<"link"|"video"|"pdf"|"image"|"audio"|"document">("link"),[url,setUrl]=useState("");
 const [pdfFile,setPdfFile]=useState<File|null>(null),[rightsConfirmed,setRightsConfirmed]=useState(false);
 const [pdfKey,setPdfKey]=useState(0);
 const market=data.marketplace;
 async function perform(task:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{await task();await router.invalidate();setNotice(success);}
  catch(e){setError(e instanceof Error?e.message:"Unable to save curriculum change.");}
  finally{setBusy(false);}
 }
 const installed=market?.packs.filter(pack=>pack.entitlement==="active")??[];
 const adopted=installed.filter(pack=>pack.adoption?.status==="active");
 const choices=adopted.flatMap(pack=>pack.courses.map(course=>({...course,pack:pack.name})));
 const chosenSections=market?.sections.filter(section=>section.courseVersionId===courseVersionId)??[];
 return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Academic operations</p>
  <h1 className="font-serif text-4xl">Curriculum Marketplace</h1>
  <p className="max-w-3xl text-sm text-muted-foreground">Install published curriculum packs into your organization's library, adopt releases for a school program and supplement classes without changing the publisher's immutable material.</p>
  <nav className="flex flex-wrap gap-3" aria-label="Curriculum program scope">
   {data.programs.map(program=><Link key={program.id} to="/operations/curriculum-marketplace" search={{programId:program.id}}
    aria-current={market?.program.id===program.id?"page":undefined} className="rounded-lg border px-3 py-2 text-sm">{program.name}</Link>)}
   <Link to="/operations/curriculum" search={{programId:market?.program.id}} className="rounded-lg border px-3 py-2 text-sm underline">Curriculum Studio</Link>
  </nav>
  {error&&<p role="alert" className="rounded-lg border border-red-500 p-4 text-sm">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border p-4 text-sm">{notice}</p>}
  {!market&&<p className="rounded-lg border p-4">Select a program to browse packs under its verified school membership.</p>}
  {market&&<>
   <section className="space-y-3">
    <h2 className="font-serif text-2xl">Available curriculum packs</h2>
    <div className="grid gap-4 md:grid-cols-2">
     {market.packs.map(pack=><article key={pack.versionId} className="space-y-3 rounded-xl border bg-card p-5">
       <p className="text-xs uppercase tracking-wide text-muted-foreground">Version {pack.version} · {pack.licenseCode}</p>
       <h3 className="font-serif text-2xl">{pack.name}</h3>
       <p className="text-sm text-muted-foreground">{pack.description}</p>
       <p className="text-sm">{pack.courses.length} published course versions</p>
       <details className="text-sm"><summary className="cursor-pointer underline">View included courses</summary>
        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">{pack.courses.map(c=><li key={c.courseVersionId}>{c.code}: {c.title}</li>)}</ul>
       </details>
       {pack.entitlement!=="active"?<>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted[pack.id]??false}
         onChange={e=>setAccepted(old=>({...old,[pack.id]:e.target.checked}))}/>
         <span>I accept this pack's {pack.licenseCode} terms and understand that commercial or third-party rights require a verified agreement.</span>
        </label>
        <button type="button" disabled={busy||!accepted[pack.id]} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
         onClick={()=>perform(()=>installCurriculumPack({data:{programId:market.program.id,packId:pack.id,termsAccepted:true}}),"Pack added to your organization's library.")}>Add to library</button>
       </>:pack.adoption?.status==="active"?
        <p className="text-sm font-medium">Installed and adopted for {market.program.name}</p>:
        <button type="button" disabled={busy} className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
         onClick={()=>perform(()=>adoptCurriculumPack({data:{programId:market.program.id,packId:pack.id,versionId:pack.versionId}}),"Published pack release adopted by this program.")}>Adopt for this program</button>}
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
      <p className="text-xs text-muted-foreground">Upload a PDF directly to CAN's private storage. It is visible only in the selected program, site or class and downloadable by authorized class members.</p>
      <input key={pdfKey} type="file" accept=".pdf,application/pdf" disabled={busy||!data.pdfUpload.enabled}
        onChange={e=>setPdfFile(e.currentTarget.files?.[0]??null)} className="block w-full text-sm" aria-label="Supplemental PDF"/>
      <label className="flex items-start gap-2 text-xs">
       <input type="checkbox" checked={rightsConfirmed} disabled={busy||!data.pdfUpload.enabled}
        onChange={e=>setRightsConfirmed(e.currentTarget.checked)}/>
       <span>I have permission to share this material with authorized learners. Uploading does not authorize AI training or public redistribution.</span>
      </label>
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
  </>}
 </main>;
}
