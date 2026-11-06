import { siteTemplateCatalog } from "@/domain/public-site-templates";
import { type SitePaletteId, type SiteTemplateId, type SiteTypographyId, type SiteFontId } from "@/domain/site-theme";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PREVIEW_WIDTH = 1280;

/** Keep the complete preview in view at every card width instead of clipping a fixed thumbnail. */
function TemplatePreviewFrame({ html, name, tall = false }: {
  html: string; name: string; tall?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const resize = () => setWidth(node.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={containerRef} aria-hidden="true"
    className={cn("relative overflow-hidden border border-border pointer-events-none", tall ? "h-[32rem]" : "h-56")}>
    <iframe title={name} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy"
      className="absolute left-0 top-0 border-0"
      style={{ width: PREVIEW_WIDTH, height: 960,
        transform: `scale(${Math.min(1, width / PREVIEW_WIDTH)})`,
        transformOrigin: "top left" }} />
  </div>;
}

/** Five layouts share the production HTML renderer. Fictional samples never become school media. */
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
  const [expanded, setExpanded] = useState<SiteTemplateId | null>(null);
  const renderSample = (templateId: SiteTemplateId) => renderPublicSiteHtml({
    host: "sample.can-os.com",
    site: { name: schoolName, organizationName: "Illustrative template" }, offerings: [],
    localContent: { ...emptySiteLocalContent, welcomeMessage: "A place to learn, belong and grow.",
      localDescription: "An illustrative school story. Replace this sample with your own community’s story.",
      branding: { theme: "classic", heroImage: null, templateId,
        paletteId, typographyId, headingFontId, bodyFontId } },
  }, { path: previewPage, localPreview: true, templateGallery: true });
  const enlarged = siteTemplateCatalog.find(template => template.id === expanded);
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-sm font-semibold">Choose your website layout</legend>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Structure and page rhythm change with the template. School facts, approved copy, colors,
      fonts and photography are preserved when switching.
    </p>
    <div className="mt-3 flex gap-2" role="group" aria-label="Template preview page">
      {(["/", "/about"] as const).map(path => <Button type="button" variant="outline" key={path}
        aria-pressed={previewPage === path} onClick={() => setPreviewPage(path)}
        className="min-h-11 border px-3 text-sm">{path === "/" ? "Home" : "About"}</Button>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      Fictional sample imagery illustrates each design. These images are not your school’s facilities
      or students and will not be saved to its photo library.
    </p>
    <div role="group" aria-label="School website templates"
      className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {siteTemplateCatalog.map(template => {
        const selected = template.id === value;
        return <div key={template.id}
          className={cn("min-w-0 border bg-card p-2 transition-colors",
            selected ? "border-primary ring-2 ring-primary/50" : "border-border")}>
          <Button type="button" variant="ghost" aria-pressed={selected} onClick={() => onChange(template.id)}
            className="w-full min-w-0 justify-start text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <TemplatePreviewFrame html={renderSample(template.id)} name={`${template.name} sample ${previewPage}`} />
            <span className="flex flex-wrap items-start justify-between gap-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{template.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{template.character}</span>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{template.description}</span>
              </span>
              <span className={cn("border px-2 py-1 text-2xs font-semibold",
                selected ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                {selected ? "Selected" : "Choose"}
              </span>
            </span>
          </Button>
          <Button type="button" variant="ghost" onClick={() => setExpanded(template.id)}
            className="min-h-11 w-full border-t px-3 py-2 text-left text-xs font-semibold underline underline-offset-4">
            Larger preview of {template.name}
          </Button>
        </div>;
      })}
    </div>
    {enlarged && <section aria-label={`Larger preview of ${enlarged.name}`}
      className="mt-5 border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{enlarged.name} · {previewPage === "/" ? "Home" : "About"}</h3>
        <Button type="button" variant="outline" onClick={() => setExpanded(null)}
          className="min-h-11 border px-3 py-2 text-sm">Close larger preview</Button>
      </div>
      <TemplatePreviewFrame html={renderSample(enlarged.id)}
        name={`${enlarged.name} enlarged ${previewPage}`} tall />
      <p className="mt-2 text-xs text-muted-foreground">
        This is a fictional layout preview. The selected template is unchanged until you choose it above.
      </p>
    </section>}
  </fieldset>;
}
