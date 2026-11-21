import { useState } from "react";
import { siteTemplateCatalog } from "@/domain/public-site-templates";
import type { SiteTemplateId, SitePaletteId, SiteTypographyId, SiteFontId } from "@/domain/site-theme";
import { publicSitePagePaths, type PublicSitePath } from "@/domain/public-site-paths";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const previewLabels: Record<PublicSitePath, string> = {
  "/": "Home", "/about": "About us", "/leadership": "Leadership", "/academics": "Academics",
  "/school-day": "Learning model", "/student-life": "Student life",
  "/families": "Families", "/admissions": "Admissions", "/tuition": "Tuition & aid",
  "/faq": "FAQs", "/contact": "Contact", "/programs": "Programs",
  "/courses": "Courses", "/classes": "Classes",
};
type Rect = readonly [number,number,number,number,number?];
/** The only gallery input is template structure. Never use Site names,
 * palette, typography, copy, real/sample photos, or synthetic demo data. */
const structuralLayouts: Record<SiteTemplateId,readonly Rect[]> = {
  heritage: [[0,0,200,17,1],[13,27,83,9,2],[13,42,76,4],[13,51,59,4],[107,24,80,59,0],[13,94,84,45,0],[103,94,84,45,0]],
  community: [[0,0,200,17,1],[13,26,78,60,0],[102,29,85,9,2],[102,45,74,4],[102,54,62,4],[13,96,54,40,0],[73,96,54,40,0],[133,96,54,40,0]],
  modern: [[0,0,42,142,1],[55,12,128,10,2],[55,32,132,55,0],[55,98,92,5,2],[55,112,124,4],[55,123,94,4]],
  "bright-futures": [[0,0,200,20,1],[0,20,200,65,0],[13,35,108,9,2],[13,50,94,4],[13,61,73,4],[13,96,54,42,0],[73,96,54,42,0],[133,96,54,42,0]],
  summit: [[0,0,200,87,0],[12,22,122,11,2],[12,42,110,4],[12,52,90,4],[12,98,176,42,1]],
  classic: [[0,0,200,12,1],[47,24,106,10,2],[35,42,130,4],[17,58,166,62,0],[47,130,106,5,1]],
  campus: [[0,0,200,18,1],[13,28,86,10,2],[13,46,77,4],[111,28,77,60,0],[13,63,87,25,0],[13,100,54,40,0],[73,100,54,40,0],[133,100,54,40,0]],
};
const grays=["#d1d5db","#9ca3af","#52525b","#f3f4f6"];
function Structure({id,page,viewport,thumbnail=false}:{
  id:SiteTemplateId;page:PublicSitePath;viewport:"desktop"|"mobile";thumbnail?:boolean;
}) {
  const mobile=viewport==="mobile";
  const base=structuralLayouts[id];
  const shapes: readonly Rect[]=mobile
    ? [[0,0,200,17,1],[10,27,180,12,2],[10,48,180,83,0],
       [10,143,170,5,1],[10,158,150,5],[10,175,180,38,0],[10,222,180,33,0]]
    : page==="/"?base:[
      ...base.slice(0,id==="modern"?2:1),
      [13,29,108,10,2],[13,48,164,5,1],[13,60,145,5],
      [13,82,54,54,0],[73,82,54,54,0],[133,82,54,54,0],
    ];
  const longer=mobile?270:155;
  return <svg role="img" aria-label={id+" "+(page==="/"
      ?"home":"interior")+" page, "+viewport+" grayscale layout wireframe"}
      viewBox={`0 0 200 ${longer}`}
      className={cn("block w-full border border-border bg-white",
        thumbnail?"h-24":"max-h-[38rem]")}>
    <rect width="200" height={longer} fill="#fafafa"/>
    {shapes.map(([x,y,w,h,tone],i)=><rect key={i}
      x={x} y={y} width={w} height={h} rx={tone===0?0:1}
      fill={grays[tone??3]} stroke="#d4d4d8" strokeWidth=".6"/>)}
    {(!mobile&&!thumbnail)&&[0,1,2].map(i=><g key={i}>
      <rect x={13+i*60} y="144" width="53" height="3" fill="#d4d4d8"/>
      <rect x={13+i*60} y="149" width="44" height="2" fill="#e4e4e7"/>
    </g>)}
  </svg>;
}

export function WebsiteTemplateGallery({value,onChange,disabled=false}:{
  value:SiteTemplateId;onChange:(value:SiteTemplateId)=>void;
  paletteId?:SitePaletteId;typographyId?:SiteTypographyId;schoolName:string;
  headingFontId?:SiteFontId;bodyFontId?:SiteFontId;disabled?:boolean;
}) {
  const [page,setPage]=useState<PublicSitePath>("/");
  const [viewport,setViewport]=useState<"desktop"|"mobile">("desktop");
  const chosen=siteTemplateCatalog.find(item=>item.id===value)??siteTemplateCatalog[0]!;
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="text-sm font-semibold">Choose your website wireframe</legend>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      Compare only structure, whitespace, hierarchy and page rhythm. Colors,
      photographs, typography and your wording are added in the next steps.
    </p>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(16rem,21rem)_minmax(0,1fr)]">
      <div role="group" aria-label="Website wireframe choices" className="space-y-2">
        {siteTemplateCatalog.map(item=><Button key={item.id} type="button"
          variant="outline" aria-pressed={item.id===value} disabled={disabled}
          onClick={()=>onChange(item.id)}
          className={cn("h-auto w-full items-start gap-3 whitespace-normal border p-2 text-left",
            item.id===value?"border-primary ring-2 ring-primary/40":"border-border")}>
          <span className="w-24 shrink-0">
            <Structure id={item.id} page="/" viewport="desktop" thumbnail/>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{item.name}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{item.character}</span>
            {item.id===value&&<span className="mt-2 block text-xs font-semibold">Selected</span>}
          </span>
        </Button>)}
      </div>
      <section className="min-w-0 space-y-3 border border-border bg-card p-4"
        aria-label="Selected full-size grayscale wireframe" aria-live="polite">
        <h3 className="font-serif text-xl font-semibold">{chosen.name}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Label className="grid gap-1 text-xs font-semibold">
            Page structure
            <Select aria-label="Preview page structure" value={page}
              onChange={event=>setPage(event.target.value as PublicSitePath)}>
              {publicSitePagePaths.map(path=><option key={path} value={path}>
                {previewLabels[path]}
              </option>)}
            </Select>
          </Label>
          <div className="flex gap-2" role="group" aria-label="Wireframe viewport">
            {(["desktop","mobile"] as const).map(size=><Button type="button"
              key={size} variant="outline" aria-pressed={viewport===size}
              onClick={()=>setViewport(size)} className="min-h-11">
              {size==="desktop"?"Desktop":"Mobile"}
            </Button>)}
          </div>
        </div>
        <div className={cn("mx-auto w-full",viewport==="mobile"?"max-w-64":"max-w-3xl")}>
          <Structure id={value} page={page} viewport={viewport}/>
        </div>
        <p className="text-xs text-muted-foreground">
          Layout only. Continue to Visual Identity and Your Content to see the
          actual website with your saved branding, words and images.
        </p>
      </section>
    </div>
  </fieldset>;
}
