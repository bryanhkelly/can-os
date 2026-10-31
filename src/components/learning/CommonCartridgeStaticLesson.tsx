import { useState } from "react";

/** Explicitly sandbox imported markup: never inject into the CAN application DOM. */
export function CommonCartridgeStaticLesson({programId,sectionId,resourceId}:{
 programId:string;sectionId:string;resourceId:string;
}){
 const [html,setHtml]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 return <section aria-label="Common Cartridge static lesson" className="space-y-2">
  <button type="button" disabled={loading} className="rounded border px-3 py-2"
   onClick={async()=>{
    setLoading(true);setError("");
    try{
     const {readCommonCartridgeStaticLesson}=await import("@/modules/learning/common-cartridge-import.functions");
     const result=await readCommonCartridgeStaticLesson({data:{programId,sectionId,resourceId}});
     setHtml(result.html);
    }catch(cause){
     setHtml(null);setError(cause instanceof Error?cause.message:"Unable to open lesson");
    }finally{setLoading(false);}
   }}>{loading?"Opening lesson…":"Open static lesson"}</button>
  {error&&<p role="alert">{error}</p>}
  {html!==null&&<iframe title="Imported Common Cartridge lesson"
   sandbox="" referrerPolicy="no-referrer" srcDoc={html}
   className="min-h-96 w-full rounded border" />}
 </section>;
}
