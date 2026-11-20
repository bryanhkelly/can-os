import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { getPartnerWebsitePreviewView, previewChurchWebsiteDraft } from "@/modules/sites/site-website-preview.functions";

/** Read-only, sandboxed rendering of authorized website preview output. */
export function WebsitePreviewPanel({ data, draftPreview }: {
  data: Awaited<ReturnType<typeof getPartnerWebsitePreviewView>>;
  draftPreview?: Awaited<ReturnType<typeof previewChurchWebsiteDraft>> | null;
}) {
  const [selected, setSelected] = useState("/");
  const [device, setDevice] = useState<"desktop"|"mobile">("desktop");
  const saved = data.currentRevision > 0;
  const htmlPages = draftPreview ? draftPreview.previewPages : saved ? data.previewPages : {};
  const pages = Object.entries(htmlPages);
  // Never show another page's or an older revision's HTML for a missing page.
  const activeHtml = Object.hasOwn(htmlPages, selected) ? htmlPages[selected] : null;
  return <section aria-labelledby="partner-preview-title" className="mt-6  border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="partner-preview-title" className="flex items-center gap-2 font-serif text-2xl font-semibold"><Eye className="size-5 text-primary" /> {draftPreview ? "Preview of current changes · not saved" : !saved ? "No saved website design yet" : data.localContentStatus === "published" ? "Latest saved and published website" : "Latest saved private design · revision " + data.currentRevision}</h2>
    <p className="mt-2 text-sm text-muted-foreground">This read-only preview uses the same design as the hosted site. It does not submit forms or publish changes.</p>
    {pages.length > 0 && <div role="group" aria-label="Preview a website page" className="mt-4 flex flex-wrap gap-2">
      {pages.map(([path]) => <Button variant="outline" key={path} type="button" aria-pressed={selected === path}
        onClick={() => setSelected(path)} className=" border px-3 py-2 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
        {path === "/" ? "Home" : path.slice(1).replace(/-/g, " ")}
      </Button>)}
    </div>}
    <div role="group" aria-label="Preview width" className="mt-4 flex flex-wrap gap-2">
      <Button variant="outline" type="button" aria-pressed={device==="desktop"} onClick={()=>setDevice("desktop")}
        className="border px-3 py-2 text-xs font-semibold aria-pressed:border-primary aria-pressed:text-primary">Desktop</Button>
      <Button variant="outline" type="button" aria-pressed={device==="mobile"} onClick={()=>setDevice("mobile")}
        className="border px-3 py-2 text-xs font-semibold aria-pressed:border-primary aria-pressed:text-primary">Mobile</Button>
    </div>
    {activeHtml ? <iframe key={selected+"-"+device} title={`${data.siteName} ${selected} read-only website preview`}
      srcDoc={activeHtml} sandbox="" referrerPolicy="no-referrer" loading="lazy"
      className="mt-4 h-[700px] w-full border bg-white" style={{ maxWidth: device === "mobile" ? 390 : undefined }} />
      : <p role="status" className="mt-4 border p-4 text-sm">{pages.length
        ? "This page is not available in the selected preview. Choose an available page or generate an updated preview."
        : !saved ? "No website draft has been saved. Choose Preview unsaved changes to see your current design, or save a private draft to enable the full-page link." : "No preview pages are available for this Site website. Check the reserved address and Site information."}</p>}
  </section>;
}
