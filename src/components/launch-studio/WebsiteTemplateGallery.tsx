import { siteTemplateCatalog } from "@/domain/public-site-templates";
import { type SitePaletteId, type SiteTemplateId, type SiteTypographyId, type SiteFontId } from "@/domain/site-theme";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** Each card previews the template's composition, not merely a palette change.
 * It is presentation only. The full preview uses the real public-site renderer. */
export function WebsiteTemplateGallery({ value, onChange, paletteId, typographyId, schoolName, headingFontId, bodyFontId, disabled = false }: {
  value: SiteTemplateId;
  onChange: (value: SiteTemplateId) => void;
  paletteId?: SitePaletteId;
  typographyId?: SiteTypographyId;
  schoolName: string;
  headingFontId?: SiteFontId; bodyFontId?: SiteFontId;
  disabled?: boolean;
}) {
  const [previewPage, setPreviewPage] = useState<"/" | "/about">("/");
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-sm font-semibold">Choose your website layout</legend>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Structure and page rhythm change with the template. School facts, approved copy, colors,
      fonts and photography are preserved when switching.
    </p>
    <div className="mt-3 flex gap-2" role="group" aria-label="Template preview page">{(["/", "/about"] as const).map(path => <button type="button" key={path} aria-pressed={previewPage === path} onClick={() => setPreviewPage(path)} className="min-h-11 border px-3 text-sm">{path === "/" ? "Home" : "About"}</button>)}</div>
    <p className="mt-2 text-xs text-muted-foreground">Fictional sample imagery illustrates each design. These images are not your school’s facilities or students and will not be saved to its photo library.</p>
    <div role="group" aria-label="School website templates" className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {siteTemplateCatalog.map(template => {
        const selected = template.id === value;
        const html = renderPublicSiteHtml({host:"sample.can-os.com", site:{name:schoolName,organizationName:"Illustrative template"}, offerings:[],
          localContent:{...emptySiteLocalContent, welcomeMessage:"A place to learn, belong and grow.",localDescription:"An illustrative school story. Replace this sample with your own community’s story.",
            branding:{theme:"classic",heroImage:null,templateId:template.id,paletteId,typographyId,headingFontId,bodyFontId}}},
          {path:previewPage, localPreview:true,templateGallery:true});
        return <button type="button" key={template.id} aria-pressed={selected} onClick={() => onChange(template.id)}
          className={cn("min-w-0 border bg-card p-2 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "border-primary ring-2 ring-primary/50" : "border-border")}>
          <div aria-hidden="true" className="relative h-56 overflow-hidden border border-border pointer-events-none">
            <iframe title={`${template.name} sample ${previewPage}`} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy"
              className="absolute left-0 top-0 border-0" style={{width:1280,height:900,transform:"scale(.25)",transformOrigin:"top left"}} />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-2 p-3">
            <span className="min-w-0"><span className="block text-sm font-semibold">{template.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{template.character}</span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{template.description}</span></span>
            <span className={cn("border px-2 py-1 text-2xs font-semibold",selected?"border-primary text-primary":"border-border text-muted-foreground")}>
              {selected?"Selected":"Choose"}
            </span>
          </div>
        </button>;
      })}
    </div>
  </fieldset>;
}
