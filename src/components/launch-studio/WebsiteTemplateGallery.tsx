import { siteTemplateCatalog } from "@/domain/public-site-templates";
import { type SitePaletteId, type SiteTemplateId, type SiteTypographyId, type SiteFontId } from "@/domain/site-theme";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { publicSitePagePaths, type PublicSitePath } from "@/domain/public-site-paths";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const previewLabels: Record<PublicSitePath, string> = {
  "/": "Home", "/about": "Our school", "/academics": "Academics",
  "/school-day": "Learning model", "/student-life": "Student life",
  "/families": "Families", "/admissions": "Admissions", "/tuition": "Tuition & aid",
  "/faq": "FAQs", "/contact": "Contact",
  "/programs": "Programs", "/courses": "Courses", "/classes": "Classes",
};

/** Keep the complete preview in view at every card width instead of clipping a fixed thumbnail. */
function TemplatePreviewFrame({ html, name, tall = false, viewport = "desktop", grayscale = false, tiny = false }: {
  html: string; name: string; tall?: boolean; viewport?: "desktop" | "mobile"; grayscale?: boolean; tiny?: boolean;
}) {
  const previewWidth = viewport === "mobile" ? 390 : 1280;
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
    className={cn("relative overflow-hidden border border-border pointer-events-none",
      tiny ? "h-20" : tall ? "h-[32rem]" : viewport === "mobile" ? "h-72" : "h-56", grayscale && "grayscale")}>
    <iframe title={name} srcDoc={html} sandbox="" tabIndex={-1} loading="lazy"
      className="absolute left-0 top-0 border-0"
      style={{ width: previewWidth, height: viewport === "mobile" ? 960 : 960,
        transform: `scale(${Math.min(1, width / previewWidth)})`,
        transformOrigin: "top left" }} />
  </div>;
}

/** Seven public designs share the approved renderer. Samples never become school media. */
export function WebsiteTemplateGallery({ value, onChange, paletteId, typographyId, schoolName, headingFontId, bodyFontId, disabled = false }: {
  value: SiteTemplateId;
  onChange: (value: SiteTemplateId) => void;
  paletteId?: SitePaletteId;
  typographyId?: SiteTypographyId;
  schoolName: string;
  headingFontId?: SiteFontId; bodyFontId?: SiteFontId;
  disabled?: boolean;
}) {
  const [previewPage, setPreviewPage] = useState<PublicSitePath>("/");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [styledPreview, setStyledPreview] = useState(false);
  const renderSample = (templateId: SiteTemplateId) => renderPublicSiteHtml({
    host: "sample.can-os.com",
    demonstration: true,
    site: { name: schoolName, organizationName: "Illustrative template" }, offerings: [],
    // Fictional-only examples let every Site template preview all enrollment
    // page layouts. They never create a Course, Class or public application.
    enrollmentOpportunities: [
      {id:"program:fictional",targetId:"fictional",kind:"program" as const,
        title:"Summer Learning",description:"Fictional community program",status:"explore" as const},
      {id:"course:fictional",targetId:"fictional",kind:"course" as const,
        title:"Digital Skills",description:"Fictional independent Course",status:"explore" as const},
      {id:"class:fictional",targetId:"fictional",kind:"class" as const,
        title:"AI Learning",description:"Fictional facilitated Class",status:"explore" as const},
    ],
    academicPrograms: [
      { programId: "sample-learning", title: "Learning pathways", typeLabel: "Illustrative learning",
        summary: "Explore a fictional example of discovery and purposeful study.",
        grades: { min: "6", max: "12" }, delivery: { onsite: true, asynchronous: true,
          liveOnline: false, onsiteDaysPerWeek: 3 }, availability: "planned", applicationOpen: false },
      { programId: "sample-community", title: "Community experiences", typeLabel: "Illustrative program",
        summary: "An example of learning and community life coming together.",
        grades: { min: "6", max: "12" }, delivery: { onsite: true, asynchronous: true,
          liveOnline: false, onsiteDaysPerWeek: 3 }, availability: "planned", applicationOpen: false },
    ],
    localContent: { ...emptySiteLocalContent, heroHeadline: "Discover what is possible.",
      welcomeMessage: "A place to learn, belong and grow.",
      schoolVision: "Help young people grow in curiosity, confidence, and purpose.",
      churchHistory: "An illustrative community history created to compare school designs.",
      communityOutreach: "Fictional students and mentors imagine meaningful service together.",
      localDescription: "A fictional school story for comparing templates, not an actual institution.",
      branding: { theme: "classic", heroImage: null, templateId,
        paletteId, typographyId, headingFontId, bodyFontId } },
  }, { path: previewPage, localPreview: true, templateGallery: true });
  const chosen = siteTemplateCatalog.find(template => template.id === value) ?? siteTemplateCatalog[0]!;
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-sm font-semibold">Choose your school's public website design</legend>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Structure and page rhythm change with the template. School facts, approved copy, colors,
      fonts and photography are preserved when switching.
    </p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <Label className="grid gap-1 text-xs font-semibold">
        Page to preview
        <Select aria-label="Preview school page" value={previewPage}
          onChange={event => setPreviewPage(event.target.value as PublicSitePath)}
          className="min-h-11">
          {publicSitePagePaths.map(path => <option key={path} value={path}>{previewLabels[path]}</option>)}
        </Select>
      </Label>
      <div className="flex gap-2" role="group" aria-label="Template preview viewport">
        {(["desktop", "mobile"] as const).map(size => <Button type="button"
          variant="outline" key={size} aria-pressed={viewport === size}
          onClick={() => setViewport(size)} className="min-h-11 border px-3 text-sm">
          {size === "desktop" ? "Desktop" : "Mobile"}
        </Button>)}
      </div>
    </div>
    <Button type="button" variant="outline" aria-pressed={styledPreview}
      onClick={()=>setStyledPreview(value=>!value)} className="mt-3 min-h-11 border px-3 text-sm">
      {styledPreview?"Return to grayscale wireframe":"Show styled example"}
    </Button>
    <p className="mt-2 text-xs text-muted-foreground">
      Fictional sample imagery illustrates each design. These images are not your school’s facilities
      or students and will not be saved to its photo library.
    </p>
    <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]">
      <div role="group" aria-label="School website templates" className="min-w-0 space-y-2">
        {siteTemplateCatalog.map(template=>{
          const selected=template.id===value;
          return <Button key={template.id} type="button" variant="outline" aria-pressed={selected}
            onClick={()=>onChange(template.id)} disabled={disabled}
            className={cn("h-auto w-full min-w-0 items-start gap-3 whitespace-normal border p-2 text-left",
              selected?"border-primary ring-2 ring-primary/40":"border-border")}>
            <div className="w-24 shrink-0 overflow-hidden">
              <TemplatePreviewFrame html={renderSample(template.id)}
                name={`${template.name} layout thumbnail`} viewport="desktop" grayscale={!styledPreview} tiny/>
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{template.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{template.character}</span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">{template.description}</span>
              {selected && <span className="mt-2 block text-xs font-semibold text-primary">Selected</span>}
            </span>
          </Button>;
        })}
      </div>
      <section className="min-w-0 border bg-card p-4" aria-label="Selected full-size wireframe" aria-live="polite">
        <h3 className="font-serif text-xl font-semibold">{chosen.name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{chosen.description}</p>
        <p className="my-3 text-xs text-muted-foreground">
          {styledPreview?"Styled example. Select colors and type separately in Visual Identity.":
            "Grayscale layout preview, not a finished school website."}
        </p>
        <TemplatePreviewFrame key={`${value}:${previewPage}:${viewport}:${styledPreview}`}
          html={renderSample(value)} name={`${chosen.name} ${previewLabels[previewPage]}`}
          viewport={viewport} tall grayscale={!styledPreview}/>
        <p className="mt-3 text-xs text-muted-foreground">
          Changing a layout does not change your website copy, colors, fonts or photos.
        </p>
      </section>
    </div>
  </fieldset>;
}
