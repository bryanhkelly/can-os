import { useEffect, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previewSiteMarketingArtifact } from "@/modules/programs/site-marketing-artifacts.functions";
import { marketingFormatOptions, type MarketingFormat, type MarketingPackageContent } from "@/domain/marketing-package-v61";

type MaterialPreview = Awaited<ReturnType<typeof previewSiteMarketingArtifact>>;

/** Read-only preview. The server uses the exact renderer that creates immutable releases. */
export function MarketingMaterialPreviewV61({siteId,brandVersionId,format,content}:{
  siteId:string;
  brandVersionId:string|null;
  format:MarketingFormat;
  content:MarketingPackageContent;
}) {
  const [preview,setPreview]=useState<MaterialPreview|null>(null);
  const [pending,setPending]=useState(true);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    let live=true;
    setPending(true);
    setPreview(null);
    setError("");
    // Debounce typing. Previous requests may finish after later edits, so
    // invalidate their results in cleanup and never show stale branded copy.
    const timer=window.setTimeout(()=>{
      void previewSiteMarketingArtifact({data:{siteId,brandVersionId,format,content}})
        .then(result=>{
          if(live){setPreview(result);setPending(false);}
        })
        .catch(cause=>{
          if(live){
            setError(cause instanceof Error?cause.message:"Unable to render this preview.");
            setPending(false);
          }
        });
    },350);
    return ()=>{live=false;window.clearTimeout(timer);};
  },[siteId,brandVersionId,format,content,retry]);

  const label=marketingFormatOptions.find(option=>option.id===format)?.label??format;
  const isEmail=preview?.state==="ready"&&preview.mimeType==="text/html";
  const isVector=preview?.state==="ready"&&preview.mimeType==="image/svg+xml";
  const vectorSrc=isVector
    ? "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(preview.body)
    : null;
  return <section aria-label={"Preview "+label} className="min-w-0 border border-border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Eye className="size-4 text-primary" aria-hidden="true"/>
          {label} preview
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">Actual output layout, not a placeholder.</p>
      </div>
      <Button type="button" variant="ghost" size="sm" disabled={pending}
        onClick={()=>setRetry(value=>value+1)}>
        <RefreshCw className="size-4" aria-hidden="true"/> Refresh
      </Button>
    </div>
    <div className="flex min-h-[24rem] min-w-0 items-center justify-center overflow-hidden bg-muted/25 p-4 sm:p-6">
      {pending&&<p role="status" className="text-sm text-muted-foreground">Preparing branded preview…</p>}
      {!pending&&error&&<div role="alert" className="max-w-md space-y-3 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground">Your saved package and Brand have not changed.</p>
      </div>}
      {!pending&&preview?.state==="missing-brand"&&
        <div className="max-w-sm space-y-3 text-center">
          <p className="font-semibold">Save your Site Brand first</p>
          <p className="text-sm text-muted-foreground">Select colors, typography and a logo in Establish before previewing branded materials.</p>
          <a href={"/launch/website?siteId="+encodeURIComponent(siteId)+"&returnToHub=true"}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
            Open Website &amp; Brand
          </a>
        </div>}
      {!pending&&preview?.state==="claims-review-required"&&
        <div className="max-w-sm space-y-2 text-center">
          <p className="font-semibold">Review your message</p>
          <p className="text-sm text-muted-foreground">Remove unverified institutional or enrollment claims before previewing this material.</p>
        </div>}
      {!pending&&preview?.state==="requires-public-destination"&&
        <div className="max-w-sm space-y-2 text-center">
          <p className="font-semibold">A public destination is required</p>
          <p className="text-sm text-muted-foreground">QR cards need a stable, authorized public URL. A temporary website preview link is not appropriate for printed materials.</p>
        </div>}
      {!pending&&isVector&&vectorSrc&&
        <img src={vectorSrc} alt={"Branded "+label+" layout with your current draft copy"}
          className="max-h-[36rem] max-w-full border border-border bg-white object-contain shadow-sm"/>}
      {!pending&&isEmail&&preview?.state==="ready"&&
        <iframe title="Branded email HTML preview" sandbox="" srcDoc={preview.body}
          className="h-[34rem] w-full max-w-[600px] border border-border bg-white shadow-sm"/>}
    </div>
    {preview?.state==="ready"&&<div className="border-t px-4 py-3 text-xs text-muted-foreground">
      Preview uses saved Brand v{preview.brandRevision} and template v{preview.templateVersion}.
      Changes to this draft appear here before saving. No file is generated or distributed.
    </div>}
  </section>;
}
