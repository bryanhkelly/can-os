import { siteTemplateCatalog } from "@/domain/public-site-templates";
import { type SitePaletteId, type SiteTemplateId, type SiteTypographyId, type SiteFontId } from "@/domain/site-theme";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { publicSitePagePaths, type PublicSitePath } from "@/domain/public-site-paths";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const previewLabels: Record<PublicSitePath, string> = {
  "/": "Home", "/about": "Our school", "/academics": "Academics",
  "/school-day": "Learning model", "/student-life": "Student life",
  "/families": "Families", "/admissions": "Admissions", "/tuition": "Tuition & aid",
  "/faq": "FAQs", "/contact": "Contact",
};

/** Keep the complete preview in view at every card width instead of clipping a fixed thumbnail. */
function TemplatePreviewFrame({ html, name, tall = false, viewport = "desktop" }: {
  html: string; name: string; tall?: boolean; viewport?: "desktop" | "mobile";
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
      tall ? "h-[32rem]" : viewport === "mobile" ? "h-72" : "h-56")}>
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
  const [expanded, setExpanded] = useState<SiteTemplateId | null>(null);
  const renderSample = (templateId: SiteTemplateId) => renderPublicSiteHtml({
    host: "sample.can-os.com",
    demonstration: true,
    site: { name: schoolName, organizationName: "Illustrative template" }, offerings: [],
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
  const enlarged = siteTemplateCatalog.find(template => template.id === expanded);
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
          className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm">
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
            className="w-full min-w-0 flex-col items-stretch justify-start gap-0 whitespace-normal p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <TemplatePreviewFrame html={renderSample(template.id)} name={`${template.name} sample ${previewPage}`} viewport={viewport} />
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
        <h3 className="font-semibold">{enlarged.name} · {previewLabels[previewPage]} · {viewport}</h3>
        <Button type="button" variant="outline" onClick={() => setExpanded(null)}
          className="min-h-11 border px-3 py-2 text-sm">Close larger preview</Button>
      </div>
      <TemplatePreviewFrame html={renderSample(enlarged.id)}
        name={`${enlarged.name} enlarged ${previewPage}`} viewport={viewport} tall />
      <p className="mt-2 text-xs text-muted-foreground">
        This is a fictional layout preview. The selected template is unchanged until you choose it above.
      </p>
    </section>}
  </fieldset>;
}
