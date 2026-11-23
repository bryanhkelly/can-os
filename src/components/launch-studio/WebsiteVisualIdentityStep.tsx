import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DisclosureSection } from "@/components/workspace/disclosure-section";
import { SelectionCard } from "@/components/workspace";
import { WebsiteArtworkField } from "./WebsiteArtworkField";
import { SchoolBrandPreview } from "./SchoolBrandPreview";
import { SchoolMediaFolderManager } from "@/components/operations/SchoolMediaFolderManager";
import { brandRecommendedPalette, type SiteBrandDirectionId } from "@/domain/site-brand-direction";
import { schoolBrandDesigns } from "@/domain/school-brand-identity";
import { resolveSiteTheme, curatedSitePaletteIds, curatedSitePalettes, siteTypographyIds, siteFontCatalog,
  type SiteTypographyId, type SiteFontId } from "@/domain/site-theme";
import type { SiteLocalContent } from "@/domain/site-local-content";

/** Feature presentation only. The route owns revision, draft persistence and authorization. */
export function WebsiteVisualIdentityStep({data,content,brandDirection,busy,setContent,onSelectArtwork}:{
  data:{siteId:string;siteName:string;canEdit:boolean;canPublish:boolean;mediaUploadsEnabled:boolean};
  content:SiteLocalContent;brandDirection:SiteBrandDirectionId|null;busy:boolean;
  setContent:Dispatch<SetStateAction<SiteLocalContent>>;
  onSelectArtwork:(event:ChangeEvent<HTMLInputElement>,field:"heroImage"|"logoImage")=>void;
}) {
  const selectArtwork=onSelectArtwork;
  return <div className="space-y-4">
        <div>
          <h3 className="font-serif text-2xl font-semibold">Create your visual identity</h3>

        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-4">
          <div>
            <p className="text-sm font-semibold">Suggested starting style</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Colors and fonts for {schoolBrandDesigns[content.branding.templateId ?? "heritage"].name}.
            </p>
          </div>
          <Button type="button" variant="outline" disabled={busy || !data.canEdit}
            onClick={()=>setContent(old=>{
              const design=schoolBrandDesigns[old.branding.templateId ?? "heritage"];
              return {...old,branding:{...old.branding,paletteId:design.recommendedPalette,
                typographyId:design.recommendedTypography,headingFontId:undefined,bodyFontId:undefined}};
            })}>Apply suggested style</Button>
        </div>
        <DisclosureSection title="Colors" defaultOpen>
          <fieldset disabled={busy || !data.canEdit}>
            <legend className="sr-only">Choose a color palette</legend>
            {!curatedSitePaletteIds.some(id=>id===content.branding.paletteId) && content.branding.paletteId && <p className="mb-3 text-sm text-muted-foreground">Your existing palette is retained until you choose a new one.</p>}
            <div role="group" aria-label="Site color palettes" className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {curatedSitePaletteIds.map(id=>{
                const palette=resolveSiteTheme(id,content.branding.typographyId);
                const current=(content.branding.paletteId ?? "signature")===id;
                return <SelectionCard key={id} kind="radio" name="site-color-palette"
                  value={id} checked={current}
                  onChange={checked=>{if(checked)setContent(old=>({...old,branding:{...old.branding,paletteId:id}}));}}
                  title={curatedSitePalettes[id].label}
                  icon={<span className="flex h-6 w-24 shrink-0 overflow-hidden" aria-hidden="true">
                    <span className="flex-1" style={{backgroundColor:palette.ink}}/>
                    <span className="flex-1" style={{backgroundColor:palette.secondary}}/>
                    <span className="flex-1" style={{backgroundColor:palette.accent}}/>
                    <span className="flex-1" style={{backgroundColor:palette.surface}}/>
                    <span className="flex-1" style={{backgroundColor:palette.canvas}}/>
                  </span>}
                  className="h-full min-h-16 capitalize" />;
              })}
            </div>
            {brandDirection && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border p-3 text-sm">
              <span>Suggested palette: <strong>{brandRecommendedPalette(brandDirection)}</strong></span>
              <Button type="button" variant="outline"
                onClick={()=>setContent(old=>({...old,branding:{...old.branding,paletteId:brandRecommendedPalette(brandDirection)}}))}>
                Apply suggested palette
              </Button>
            </div>}

          </fieldset>
        </DisclosureSection>
        <DisclosureSection title="Typography" defaultOpen>
          <fieldset disabled={busy || !data.canEdit} className="space-y-4">
            <legend className="sr-only">Choose typography</legend>
            <Label className="block text-sm">
              <span className="font-medium">Font pairing</span>
              <Select value={content.branding.typographyId ?? "editorial"}
                onChange={event=>setContent(old=>({...old,branding:{...old.branding,
                  typographyId:event.target.value as SiteTypographyId,headingFontId:undefined,bodyFontId:undefined}}))}
                className="mt-2 min-h-11 w-full border bg-background px-3">
                {siteTypographyIds.map(id=><option key={id} value={id}>
                  {id==="editorial"?"Editorial serif + modern sans":
                    id==="traditional"?"Heritage serif + clean sans":"Contemporary humanist sans"}
                </option>)}
              </Select>
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["headingFontId","bodyFontId"] as const).map(key=><Label key={key} className="block text-sm">
                {key==="headingFontId"?"Heading font":"Body font"}
                <Select className="mt-2 min-h-11 w-full border bg-background px-3"
                  value={content.branding[key] ?? ""}
                  onChange={event=>setContent(old=>({...old,branding:{...old.branding,
                    [key]:event.target.value?event.target.value as SiteFontId:undefined}}))}>
                  <option value="">Use default</option>
                  {Object.entries(siteFontCatalog).map(([id,font])=><option key={id} value={id}>{font.label}</option>)}
                </Select>
              </Label>)}
            </div>
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2" aria-label="Actual resolved font previews">
              {(["headingFontId","bodyFontId"] as const).map(key=>{
                const theme=resolveSiteTheme(content.branding.paletteId,content.branding.typographyId,
                  content.branding.headingFontId,content.branding.bodyFontId,content.branding.templateId);
                const chosen=content.branding[key];
                const fontFamily=key==="headingFontId"?theme.displayFont:theme.bodyFont;
                return <div key={key} className="min-w-0 border bg-background p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {key==="headingFontId"?"Heading":"Body"} · {chosen?siteFontCatalog[chosen].label:"Default pairing"}
                  </p>
                  <p className="mt-3 break-words text-2xl" style={{fontFamily}}>Learn with purpose.</p>
                  <p className="mt-2 break-words text-sm" style={{fontFamily}}>Every Site has a story worth sharing.</p>
                </div>;
              })}
            </div>
          </fieldset>
        </DisclosureSection>
        <DisclosureSection title="Wordmark & Logo">
          <div className="space-y-4">
            <SchoolBrandPreview siteId={data.siteId} schoolName={data.siteName} branding={content.branding}/>
            <WebsiteArtworkField field="logoImage" value={content.branding.logoImage ?? null}
              disabled={busy || !data.canEdit} onSelect={selectArtwork}
              onChange={next=>setContent(old=>({...old,branding:{...old.branding,logoImage:next}}))}/>
          </div>
        </DisclosureSection>
        <DisclosureSection title="Imagery">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Only use images you have permission to share.</p>
            <WebsiteArtworkField field="heroImage" value={content.branding.heroImage}
              disabled={busy || !data.canPublish} onSelect={selectArtwork}
              onChange={next=>setContent(old=>({...old,branding:{...old.branding,heroImage:next}}))}/>
            <DisclosureSection title="Import photos from a Site folder (optional)">
              <SchoolMediaFolderManager siteId={data.siteId} canPublish={data.canPublish}
                enabled={data.mediaUploadsEnabled}/>
            </DisclosureSection>
          </div>
        </DisclosureSection>
      </div>;
}
