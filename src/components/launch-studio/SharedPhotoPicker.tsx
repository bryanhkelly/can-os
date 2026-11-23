import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { siteTemplateIds, type SiteTemplateId } from "@/domain/site-theme";
import { schoolBrandDesigns } from "@/domain/school-brand-identity";
import { sharedPhotoRoles, sharedPhotoUrl, sharedPhotoDisclosure, TEMPLATE_PHOTO_LIBRARY_REVISION, type SharedPhotoReference } from "@/domain/template-sample-images";

export function SharedPhotoPicker({value,onChange,disabled,recommendedTemplate="heritage"}:{
  value?:SharedPhotoReference|null;onChange:(value:SharedPhotoReference|null)=>void;
  disabled:boolean;recommendedTemplate?:SiteTemplateId;
}){
  const [family,setFamily]=useState<SiteTemplateId>(value?.template??recommendedTemplate);
  const [ready,setReady]=useState<SharedPhotoReference["role"][]>([]);
  const [failed,setFailed]=useState<string[]>([]);
  const [status,setStatus]=useState<"loading"|"ready"|"error">("loading");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setStatus("loading");setReady([]);setFailed([]);
    void (async()=>{
      try{
        const response=await fetch("/template-photo-status?template="+encodeURIComponent(family),{signal:controller.signal});
        if(!response.ok)throw Error("Library unavailable");
        const result=await response.json() as {ready?:unknown};
        if(!Array.isArray(result.ready))throw Error("Availability unknown");
        const roles=result.ready;
        if(!controller.signal.aborted){setReady(sharedPhotoRoles.filter(role=>roles.includes(role)));setStatus("ready");}
      }catch{if(!controller.signal.aborted)setStatus("error");}
    })();
    return ()=>controller.abort();
  },[family,retry]);
  return <section className="space-y-3 border p-4" aria-label="Shared image library">
    <h3 className="text-sm font-semibold">Choose from image library</h3>
    <p className="text-sm text-muted-foreground">{sharedPhotoDisclosure} Select an image for your website hero.</p>
    {value&&<div className="space-y-2 border p-3">
      <img src={sharedPhotoUrl(value)} alt={sharedPhotoDisclosure} className="aspect-video w-full max-w-sm object-cover"/>
      <Button type="button" variant="outline" disabled={disabled} onClick={()=>onChange(null)}>Remove selected image</Button>
    </div>}
    <Select aria-label="Photography collection" value={family} onChange={event=>setFamily(event.target.value as SiteTemplateId)}>
      {siteTemplateIds.map(id=><option key={id} value={id}>{schoolBrandDesigns[id].name}</option>)}
    </Select>
    {status==="loading"&&<p role="status" className="text-sm">Loading existing photos…</p>}
    {status==="error"&&<div role="alert" className="space-y-2 text-sm"><p>Could not load the image library.</p><Button type="button" variant="outline" onClick={()=>setRetry(n=>n+1)}>Retry</Button></div>}
    {status==="ready"&&ready.length===0&&<p role="status" className="text-sm">No stored photos are available in this collection. Choose another collection.</p>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {ready.map(role=>{
        const ref:SharedPhotoReference={template:family,role,revision:TEMPLATE_PHOTO_LIBRARY_REVISION};
        const src=sharedPhotoUrl(ref);
        if(failed.includes(src))return null;
        const selected=value?.template===family&&value.role===role;
        return <Button key={src} type="button" variant="outline" aria-pressed={selected} disabled={disabled}
          className="h-auto flex-col items-stretch whitespace-normal p-2" onClick={()=>onChange(ref)}>
          <img src={src} alt={sharedPhotoDisclosure} loading="lazy" className="aspect-video w-full object-cover" onError={()=>setFailed(old=>[...old,src])}/>
          <span className="capitalize">{role.replaceAll("_"," ")}{selected?" · Selected":""}</span>
        </Button>;
      })}
    </div>
    {failed.length>0&&<p role="status" className="text-sm">Some stored images could not be loaded.</p>}
  </section>;
}
