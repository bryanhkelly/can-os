import { siteTemplateCatalog } from "@/domain/public-site-templates";
import { resolveSiteTheme, type SitePaletteId, type SiteTemplateId, type SiteTypographyId } from "@/domain/site-theme";
import { cn } from "@/lib/utils";

/** Each card previews the template's composition, not merely a palette change.
 * It is presentation only. The full preview uses the real public-site renderer. */
export function WebsiteTemplateGallery({ value, onChange, paletteId, typographyId, schoolName, disabled = false }: {
  value: SiteTemplateId;
  onChange: (value: SiteTemplateId) => void;
  paletteId?: SitePaletteId;
  typographyId?: SiteTypographyId;
  schoolName: string;
  disabled?: boolean;
}) {
  const theme = resolveSiteTheme(paletteId, typographyId);
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-sm font-semibold">Choose your website layout</legend>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Structure and page rhythm change with the template. School facts, approved copy, colors,
      fonts and photography are preserved when switching.
    </p>
    <div role="group" aria-label="School website templates" className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {siteTemplateCatalog.map(template => {
        const selected = template.id === value;
        const previewStyle = { background: theme.canvas, color: theme.ink };
        return <button type="button" key={template.id} aria-pressed={selected} onClick={() => onChange(template.id)}
          className={cn("min-w-0 border bg-card p-2 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "border-primary ring-2 ring-primary/50" : "border-border")}>
          <div aria-hidden="true" className={cn("h-44 overflow-hidden border border-border", "template-card-" + template.id)} style={previewStyle}>
            <div className="flex h-7 items-center justify-between border-b px-3 text-3xs font-bold uppercase tracking-widest"
              style={{borderColor:theme.secondary}}>
              <span className="truncate">{schoolName}</span><span>Academics · Admissions</span>
            </div>
            {template.id==="heritage" && <div className="h-[104px] px-4 py-4" style={{background:theme.ink,color:"#fff"}}>
              <div className="mb-2 h-1 w-14" style={{background:theme.accent}} />
              <div className="font-serif text-lg leading-5">Knowledge. Character.<br/>Purpose.</div>
              <div className="mt-3 h-1 w-28 bg-white/50"/></div>}
            {template.id==="community" && <div className="grid h-[104px] grid-cols-2">
              <div className="p-3"><div className="text-3xs uppercase">A school to call home</div>
                <div className="mt-2 font-serif text-base leading-4">Where every<br/>family belongs.</div></div>
              <div style={{background:theme.secondary}} className="flex items-end p-3 text-3xs text-white">Community and connection</div>
            </div>}
            {template.id==="modern" && <div className="h-[104px] p-3 text-white" style={{background:theme.ink}}>
              <div className="font-sans text-2xl font-bold uppercase leading-6 tracking-tighter">LEARN<br/>WITHOUT LIMITS.</div>
              <div className="mt-2 flex gap-1"><div className="h-2 w-12" style={{background:theme.accent}}/><div className="h-2 w-6 bg-white/60"/></div>
            </div>}
            {template.id==="bright-futures" && <div className="h-[104px] px-3 py-3" style={{background:"#fff"}}>
              <div className="text-3xs font-bold uppercase" style={{color:theme.secondary}}>Bright starts here</div>
              <div className="mt-1 font-serif text-xl leading-5">Big possibilities<br/>for every child.</div>
              <div className="mt-2 flex gap-2"><div className="h-3 flex-1" style={{background:theme.accent}}/><div className="h-3 flex-1" style={{background:theme.secondary}}/></div>
            </div>}
            {template.id==="summit" && <div className="flex h-[104px] flex-col items-center justify-center px-2 text-center text-white" style={{background:theme.secondary}}>
              <div className="mb-2 h-1 w-10 bg-white/70"/>
              <div className="font-serif text-2xl leading-5">Rise to the<br/>occasion.</div>
              <div className="mt-2 h-1 w-16 bg-white/60"/></div>}
            <div className="flex gap-1 p-2">
              <div className="h-3 flex-1" style={{background:theme.secondary,opacity:.2}}/>
              <div className="h-3 flex-1" style={{background:theme.accent,opacity:.4}}/>
              <div className="h-3 flex-1" style={{background:theme.secondary,opacity:.25}}/>
            </div>
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
