import {useEffect,useRef,useState} from "react";
import {previewSiteIntelligence,processSiteIntelligence,readSiteIntelligenceContent} from "@/modules/sites/site-content-generation.functions";
import type {SiteGenerationOptions} from "@/domain/site-content-generation";
import {generationOutcomeMessage} from "@/domain/site-generation-status";
type Request={siteId:string;consumer:"website"|"outreach";options:SiteGenerationOptions};
type Preview=Awaited<ReturnType<typeof previewSiteIntelligence>>;
export async function runSiteGeneration(request:Request,preview:Preview){
 if(!preview.eligibility.allowed)return {success:false,kind:preview.eligibility.code==="processing"?"processing" as const:"blocked" as const,message:preview.eligibility.message,stored:null};
 const outcome=await processSiteIntelligence({data:{...request,digest:preview.digest,externalProcessingConfirmed:true}});
 const result=generationOutcomeMessage(outcome);
 if(!result.success)return {...result,kind:outcome.status==="processing"?"processing" as const:"failed" as const,stored:null};
 // A confirmed generation/reuse followed by a failed read is not a failed write.
 // Retry the read, not the provider command.
 try{
  const stored=await readSiteIntelligenceContent({data:{siteId:request.siteId,consumer:request.consumer}});
  if(!stored.package||stored.package.stale)return {success:false,kind:"refresh-required" as const,message:"Processing was confirmed, but current generated content is unavailable. Review saved Site information and reload the stored content.",stored:null};
  return {...result,kind:"ready" as const,stored};
 }catch{
  return {success:false,kind:"refresh-required" as const,message:"Processing was confirmed, but the saved content could not be read. Reload the stored content before another processing run.",stored:null};
 }
}
export function useSiteGenerationPreview(request:Request,enabled:boolean,revision:number){
 const key=JSON.stringify(request);
 const [state,setState]=useState<{key:string;revision:number;preview:Preview|null;error:string}|null>(null);
 const [refresh,setRefresh]=useState(0);
 const sequence=useRef(0);
 useEffect(()=>{
  const id=++sequence.current;
  if(!enabled)return;
  setState(null);
  void previewSiteIntelligence({data:JSON.parse(key) as Request}).then(preview=>{
   if(sequence.current===id)setState({key,revision,preview,error:""});
  }).catch(()=>{
   if(sequence.current===id)setState({key,revision,preview:null,error:"Generation status could not be checked. Reload status or edit manually."});
  });
  return ()=>{sequence.current++;};
 },[key,enabled,revision,refresh]);
 const current=enabled&&state?.key===key&&state.revision===revision?state:null;
 return {preview:current?.preview??null,error:current?.error??"",reload:()=>{setState(null);setRefresh(n=>n+1);}};
}
