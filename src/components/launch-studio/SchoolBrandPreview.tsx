import type { SiteLocalBranding } from "@/domain/site-local-content";
import {
  resolveSchoolBrand, schoolBrandSvgDataUrl,
} from "@/domain/school-brand-identity";

type Props = {
  schoolName: string;
  branding: SiteLocalBranding;
  siteId: string;
};

/**
 * A live, private identity preview. This is not a campaign, a publication
 * action, or permission to reuse example photography from the ZIP assets.
 */
export function SchoolBrandPreview({ schoolName, branding, siteId }: Props) {
  const brand = resolveSchoolBrand(schoolName, branding);
  const wordmark = schoolBrandSvgDataUrl(schoolName, branding);
  const filename = (schoolName.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "school") + "-wordmark.svg";
  const tokens = [
    ["Ink", brand.theme.ink], ["Paper", brand.theme.canvas],
    ["Accent", brand.theme.accent], ["Secondary", brand.theme.secondary],
  ] as const;
  return <section aria-labelledby="school-brand-preview-title"
    className="rounded-xl border bg-card p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="school-brand-preview-title" className="font-serif text-xl font-semibold">Your school brand, in one place</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {brand.design.name} · School-specific identity from your current template, colors and typography.
        </p>
      </div>
      <a href={wordmark} download={filename}
        className="inline-flex min-h-11 items-center rounded-md border px-4 py-2 text-sm font-semibold text-primary">
        Download SVG wordmark
      </a>
    </div>
    <div className="mt-5 overflow-hidden rounded-lg border" style={{background:brand.background}}>
      <img src={wordmark} alt={`${brand.schoolName} school brand wordmark`}
        className="block h-auto w-full" />
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand colors</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {tokens.map(([name, color])=><div key={name} className="min-w-0">
            <span aria-hidden="true" className="block h-12 rounded-md border" style={{background:color}}/>
            <span className="mt-1 block text-xs font-medium">{name}</span>
            <code className="block text-xs text-muted-foreground">{color}</code>
          </div>)}
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Typography</p>
        <p className="mt-2 text-2xl leading-tight" style={{fontFamily:brand.theme.displayFont}}>
          Learning with purpose.
        </p>
        <p className="mt-2 text-sm text-muted-foreground" style={{fontFamily:brand.theme.bodyFont}}>
          Clear, thoughtful communication for families.
        </p>
      </div>
    </div>
    <div className="mt-4 border-t pt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand applications · visual preview only</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="overflow-hidden rounded-md border" aria-label="Website header brand preview">
          <div className="px-4 py-5" style={{background:brand.background,color:brand.foreground}}>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center border-2 text-lg font-bold"
                style={{borderColor:brand.accent,color:brand.accent,
                  borderRadius:brand.design.emblem==="circle"?"50%":
                    brand.design.emblem==="rounded"?"12px":"0"}}>
                {brand.monogram}
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-bold" style={{fontFamily:brand.theme.displayFont}}>
                  {brand.schoolName}
                </p>
                <p className="mt-1 text-xs font-medium tracking-wider" style={{color:brand.accent}}>
                  {brand.design.caption}
                </p>
              </div>
            </div>
          </div>
          <p className="p-2 text-xs text-muted-foreground">Website identity</p>
        </div>
        <div className="overflow-hidden rounded-md border" aria-label="Branded email header preview">
          <div className="px-4 py-5" style={{background:brand.background,color:brand.foreground}}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{color:brand.accent}}>
              {brand.schoolName}
            </p>
            <p className="mt-3 text-xl" style={{fontFamily:brand.theme.displayFont}}>
              A message from your school
            </p>
          </div>
          <p className="p-2 text-xs text-muted-foreground">Branded email header · live invitation transport uses approved school templates</p>
        </div>
      </div>
    </div>
    <section aria-labelledby="brand-family-application-title" className="mt-5 border-t pt-5">
      <h4 id="brand-family-application-title" className="font-semibold">Family-facing brand applications</h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Open full-page versions of the branded family-interest page, survey, and three email layouts.
        All seven school designs use the same saved Site colors and typography.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {([
          ["landing","Family-interest landing page"],
          ["survey","Three-minute family survey"],
          ["email-survey","Survey invitation email"],
          ["email-confirmation","Interest confirmation email"],
          ["email-update","Family update email"],
        ] as const).map(([view,label])=><a key={view}
          href={`/brand-preview?siteId=${encodeURIComponent(siteId)}&view=${view}`}
          target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center rounded-md border bg-background px-4 py-3 text-sm font-semibold text-primary hover:bg-muted">
            {label} <span aria-hidden="true" className="ml-auto">↗</span>
          </a>)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Previews are private and read-only, using the last saved school design (or a starter if none is saved).
        Save your current changes before opening them. Previews do not send messages or collect responses.
        Approved Program-linked invitations are sent separately through the existing recruitment service.
      </p>
    </section>
    <p className="mt-3 text-xs text-muted-foreground">
      This is a preview of the current editable design. Save private draft to retain changes.
      Downloading a logo does not publish your website or activate family communications.
    </p>
  </section>;
}
