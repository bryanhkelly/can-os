import {useCallback,useEffect,useRef,useState,type ChangeEvent} from "react";
import {
  beginSchoolSiteMediaUpload,finishSchoolSiteMediaUpload,listSchoolSiteMedia,
  approveSchoolSiteMediaFolder,revokeSchoolSiteMediaFolder,
} from "@/modules/sites/site-media-folder.functions";

type MediaItem=Awaited<ReturnType<typeof listSchoolSiteMedia>>[number];
type SubjectRelease="no_identifiable_people"|"all_identifiable_people_cleared";

/** Browser-only re-encoding drops EXIF, GPS, embedded metadata, and orientation
 * source data before any image reaches private R2. Do not upload originals. */
async function prepareSafeMedia(file:File){
  if(!["image/jpeg","image/png"].includes(file.type)||file.size>8*1024*1024)
    throw new Error("Use JPEG or PNG photos no larger than 8 MB each.");
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(160,Math.round(bitmap.width*scale));
    const height=Math.max(160,Math.round(bitmap.height*scale));
    if(bitmap.width<160||bitmap.height<160)
      throw new Error("Images must be at least 160 pixels on both sides.");
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("This browser cannot safely prepare school photographs.");
    ctx.drawImage(bitmap,0,0,width,height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.83));
    if(!blob||blob.size<16||blob.size>8*1024*1024)
      throw new Error("Could not prepare a bounded, metadata-free image.");
    const name=file.name.replace(/\.[^.]+$/,"").replace(/[^a-zA-Z0-9 _-]/g,"").slice(0,135);
    return {blob,fileName:(name||"school-photo")+".jpg",width,height};
  }finally{bitmap.close();}
}

/** No individual photo choices. Import a folder and CAN automatically places
 * rights-cleared, categorized assets alongside its built-in fallback artworks.
 * Every file is private until an authorized editor explicitly attests rights.
 */
export function SchoolMediaFolderManager({siteId,canPublish}:{
  siteId:string;canPublish:boolean;
}){
  const folderRef=useRef<HTMLInputElement>(null);
  const [items,setItems]=useState<MediaItem[]>([]);
  const [working,setWorking]=useState(false);
  const [status,setStatus]=useState("");
  const [error,setError]=useState("");
  const [rights,setRights]=useState(false);
  const [release,setRelease]=useState<SubjectRelease|null>(null);
  const [consents,setConsents]=useState(false);
  const [reason,setReason]=useState("");
  const [revokeReason,setRevokeReason]=useState("");
  const [confirmRevoke,setConfirmRevoke]=useState(false);
  const refresh=useCallback(async()=>{
    const result=await listSchoolSiteMedia({data:{siteId}});
    setItems(result);
  },[siteId]);
  useEffect(()=>{
    folderRef.current?.setAttribute("webkitdirectory","");
    folderRef.current?.setAttribute("directory","");
  },[]);
  useEffect(()=>{
    if(canPublish)void refresh().catch(()=>setError("Could not read the current private media list."));
  },[canPublish,refresh]);

  async function stageFolder(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files??[]);
    event.target.value="";
    if(!files.length||working)return;
    setError("");setWorking(true);setStatus("Preparing your school's media folder...");
    try{
      const candidates=files.filter(file=>["image/jpeg","image/png"].includes(file.type) &&
        file.size<=8*1024*1024).slice(0,40);
      if(!candidates.length)throw new Error("No supported JPEG or PNG images were found in this folder.");
      let staged=0;
      for(const [index,file] of candidates.entries()){
        setStatus(`Preparing image ${index+1} of ${candidates.length}...`);
        try{
          const safe=await prepareSafeMedia(file);
          const input={siteId,fileName:safe.fileName,
            folderPath:(file.webkitRelativePath||"").slice(0,300),
            mimeType:"image/jpeg" as const,size:safe.blob.size,
            width:safe.width,height:safe.height};
          const upload=await beginSchoolSiteMediaUpload({data:input});
          const put=await fetch(upload.uploadUrl,{
            method:"PUT",headers:upload.uploadHeaders,body:safe.blob,
            credentials:"omit",redirect:"error",
          });
          if(!put.ok)throw new Error("Private photo upload was rejected by object storage.");
          await finishSchoolSiteMediaUpload({data:{...input,key:upload.key}});
          staged++;
        }catch(caught){
          throw new Error(`Folder import stopped at image ${index+1} (${file.name}): ${caught instanceof Error?caught.message:"Upload failed"}`);
        }
      }
      await refresh();
      setStatus(`${staged} photos imported privately. Review folder rights once below to make them eligible for automatic website placement.`);
      if(files.length>40)setStatus(previous=>previous+" Only the first 40 files were imported; use the folder again for additional files.");
    }catch(caught){setError(caught instanceof Error?caught.message:"The media folder could not be imported.");}
    finally{setWorking(false);}
  }

  const pending=items.filter(item=>item.reviewStatus==="pending");
  const approved=items.filter(item=>item.reviewStatus==="approved");
  const revoked=items.filter(item=>item.reviewStatus==="revoked");
  async function approve(){
    if(working||!rights||!release||!consents||reason.trim().length<10)return;
    setError("");setWorking(true);
    try{
      const ids=pending.slice(0,40).map(item=>item.documentId);
      if(!ids.length)throw new Error("No new photos need folder review.");
      await approveSchoolSiteMediaFolder({data:{siteId,documentIds:ids,
        rightsConfirmed:true,subjectRelease:release,
        confirmEachFileCovered:true,reason}});
      await refresh();
      setRights(false);setConsents(false);setRelease(null);setReason("");
      setStatus("Folder images approved. CAN OS will automatically select suitable photos for published pages. Unfilled placements retain CAN fallback artwork.");
    }catch(caught){setError(caught instanceof Error?caught.message:"Folder review failed.");}
    finally{setWorking(false);}
  }
  async function revokeAll(){
    if(working||!confirmRevoke||revokeReason.trim().length<10)return;
    setWorking(true);setError("");
    try{
      const ids=approved.slice(0,40).map(item=>item.documentId);
      if(!ids.length)throw new Error("No approved photos to revoke.");
      await revokeSchoolSiteMediaFolder({data:{siteId,documentIds:ids,reason:revokeReason}});
      await refresh();
      setConfirmRevoke(false);setRevokeReason("");
      setStatus("Approved photos revoked; CAN fallback artwork takes their place on subsequent public requests.");
    }catch(caught){setError(caught instanceof Error?caught.message:"Could not revoke media.");}
    finally{setWorking(false);}
  }

  return <section className="mt-6 rounded-2xl border bg-card p-6" aria-labelledby="school-media-folder-title">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Website imagery</p>
    <h2 id="school-media-folder-title" className="mt-2 font-serif text-2xl font-semibold">Point CAN to your school's photos</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      Choose an existing folder, once. CAN prepares and organizes up to 40 photos per import,
      matches them to website pages, and fills gaps with its original artwork library.
      You do not need to select hero or page images individually. Nothing uploads publicly until rights review.
    </p>
    <label className="mt-4 block text-sm font-semibold">
      Upload a school media folder (including subfolders)
      <input ref={folderRef} type="file" multiple accept="image/jpeg,image/png"
        disabled={!canPublish||working} onChange={event=>void stageFolder(event)}
        className="mt-2 block w-full rounded-lg border p-3 text-sm"/>
    </label>
    {!canPublish&&<p className="mt-2 text-sm">Only a verified Site website editor with publishing authority can import or approve photos.</p>}
    <p className="mt-3 text-sm" role="status">{status||"No images required: built-in CAN artwork automatically fills empty placements."}</p>
    {error&&<p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="School media import status">
      <p className="rounded-lg border p-3 text-sm"><strong>{approved.length}</strong> approved</p>
      <p className="rounded-lg border p-3 text-sm"><strong>{pending.length}</strong> awaiting rights review</p>
      <p className="rounded-lg border p-3 text-sm"><strong>{revoked.length}</strong> revoked</p>
    </div>
    {pending.length>0&&<fieldset disabled={working||!canPublish} className="mt-5 space-y-3 rounded-xl border p-4">
      <legend className="px-2 font-semibold">One review for the imported folder</legend>
      <p className="text-sm">This approval covers {Math.min(pending.length,40)} private photos.
        Check that every included image has appropriate usage rights and subject permissions.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={rights}
        onChange={event=>setRights(event.target.checked)}/>
        I have the rights or permission to publish each included photograph on our school's public website.
      </label>
      <div className="grid gap-2 text-sm" role="group" aria-label="Person and child photo release status">
        <label className="flex gap-2"><input type="radio" name="subject-release" checked={release==="no_identifiable_people"}
          onChange={()=>setRelease("no_identifiable_people")}/>
          None of these images contains identifiable people.
        </label>
        <label className="flex gap-2"><input type="radio" name="subject-release" checked={release==="all_identifiable_people_cleared"}
          onChange={()=>setRelease("all_identifiable_people_cleared")}/>
          Every identifiable person, including any children, has the required permission or guardian release for this use.
        </label>
      </div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={consents}
        onChange={event=>setConsents(event.target.checked)}/>
        This confirmation covers every imported image, not just representative samples.
      </label>
      <label className="block text-sm font-medium">Rights review note
        <textarea rows={2} value={reason} onChange={event=>setReason(event.target.value)}
          placeholder="Document the source and image-use permissions" className="mt-1 w-full rounded-lg border bg-background p-2"/>
      </label>
      <button type="button" disabled={!rights||!release||!consents||reason.trim().length<10||working}
        onClick={()=>void approve()} className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        Approve entire folder for automatic placement
      </button>
    </fieldset>}
    {approved.length>0&&<details className="mt-5 rounded-xl border p-4">
      <summary className="cursor-pointer text-sm font-semibold">Revoke previously approved school photos</summary>
      <p className="mt-2 text-sm text-muted-foreground">Revocation stops new public requests from serving these images. Original CAN artwork will be used where no other approved photo is available.</p>
      <label className="mt-2 block text-sm">Reason for revocation
        <textarea rows={2} value={revokeReason} onChange={event=>setRevokeReason(event.target.value)}
          className="mt-1 w-full rounded-md border p-2"/>
      </label>
      <label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={confirmRevoke}
        onChange={event=>setConfirmRevoke(event.target.checked)}/>Revoke all currently approved photos displayed here</label>
      <button type="button" disabled={!canPublish||working||!confirmRevoke||revokeReason.trim().length<10}
        onClick={()=>void revokeAll()} className="mt-3 min-h-11 rounded-md border px-4 text-sm font-semibold disabled:opacity-50">
        Revoke approved photos
      </button>
    </details>}
  </section>;
}
