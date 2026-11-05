import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { WebsiteTemplateGallery } from "./WebsiteTemplateGallery";
import { sitePaletteIds, siteTypographyIds, type SiteTemplateId, type SitePaletteId, type SiteTypographyId } from "@/domain/site-theme";
import { Label } from "@/components/ui/label";

const meta = { title: "Workflows/Website Launch Studio", component: WebsiteTemplateGallery,
  parameters: { layout: "fullscreen" } } satisfies Meta<typeof WebsiteTemplateGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

function GalleryFixture() {
  const [template, setTemplate] = useState<SiteTemplateId>("heritage");
  const [palette, setPalette] = useState<SitePaletteId>("heritage");
  const [typography, setTypography] = useState<SiteTypographyId>("editorial");
  return <div className="min-h-screen bg-background p-5 sm:p-9">
    <header className="mb-7 max-w-3xl border-b pb-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">School Website Studio · Step 2 of 5</p>
      <h1 className="mt-2 font-serif text-4xl font-normal">Choose a website design.</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">The selected layout changes the structure of the public website. Your school's actual content, typography, palette and approved media stay independent.</p>
    </header>
    <div className="mb-6 grid gap-4 border bg-card p-5 sm:grid-cols-2">
      <div><Label htmlFor="website-story-palette">Curated color scheme</Label>
        <select id="website-story-palette" value={palette} onChange={event=>setPalette(event.target.value as SitePaletteId)}
          className="mt-2 min-h-11 w-full border bg-background px-3 text-sm">
          {sitePaletteIds.map(id=><option key={id} value={id}>{id}</option>)}
        </select></div>
      <div><Label htmlFor="website-story-font">Typography pairing</Label>
        <select id="website-story-font" value={typography} onChange={event=>setTypography(event.target.value as SiteTypographyId)}
          className="mt-2 min-h-11 w-full border bg-background px-3 text-sm">
          {siteTypographyIds.map(id=><option key={id} value={id}>{id}</option>)}
        </select></div>
    </div>
    <WebsiteTemplateGallery schoolName="Rivermere Academy" value={template} onChange={setTemplate}
      paletteId={palette} typographyId={typography} />
    <p role="status" className="mt-6 border border-border bg-card p-4 text-xs text-muted-foreground">
      Chosen template: <strong>{template}</strong>. This is a presentation fixture and changes no canonical school record.
    </p>
  </div>;
}
export const FiveTemplates: Story = { render: () => <GalleryFixture/> };
