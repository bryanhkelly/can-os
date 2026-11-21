import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { initialMarketingContent } from "@/domain/marketing-package-v61";
import { siteMarketingTemplateVersions } from "@/domain/site-marketing-template-versions";
import type { MarketingPackageV61Record, MarketingPackageV61Release } from "./MarketingPackageReleaseHistoryV61";
import { MarketingPackageReleaseControlsV61 } from "./MarketingPackageReleaseControlsV61";

const brandVersionId = "11111111-1111-4111-8111-111111111111";
const record = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Neighborhood launch",
  content: initialMarketingContent("Example Site", "site-announcement"),
  brandVersionId, status: "draft", revision: 2,
} as unknown as MarketingPackageV61Record;

const actions = {
  onSelectCurrentBrand: vi.fn(),
  onRetryHistory: vi.fn(),
  onPreview: vi.fn(),
  onRelease: vi.fn(),
};

const base = {
  record, versions: [] as MarketingPackageV61Release[],
  currentBrand: {id:brandVersionId,revision:3},
  selectedBrandRevision: 3, releasesLoading:false, releasesUnavailable:false, busy:false,
  ...actions,
};

function buttonFor(html: string, label: string) {
  const button = (html.match(/<button\\b[^>]*>[\\s\\S]*?<\\/button>/g) ?? [])
    .find(candidate => candidate.includes(label));
  if(!button) throw new Error("Missing button: " + label);
  return button;
}

describe("V6.1 immutable Marketing Package release controls", () => {
  it("does not release a Package without a selected Brand", () => {
    const html = renderToStaticMarkup(<MarketingPackageReleaseControlsV61 {...base}
      record={{...record,brandVersionId:null}} currentBrand={null} selectedBrandRevision={null}/>);
    expect(html).toContain("No saved Brand selected");
    expect(buttonFor(html,"Create Materials")).toContain('disabled=""');
    expect(html).toContain("Preview Materials");
  });

  it("allows a first release only when prerequisites are available", () => {
    const html = renderToStaticMarkup(<MarketingPackageReleaseControlsV61 {...base}/>);
    expect(html).toContain("No materials have been created for this outreach yet");
    expect(buttonFor(html,"Create Materials")).not.toContain('disabled=""');
    const unavailable = renderToStaticMarkup(<MarketingPackageReleaseControlsV61 {...base}
      releasesUnavailable/>);
    expect(buttonFor(unavailable,"Create Materials")).toContain('disabled=""');
    expect(unavailable).toContain("Retry history");
  });

  it("disables a duplicate release when content and template revisions are unchanged", () => {
    const release = {
      id: "release-one", releaseNumber: 1, complete: true,
      title: record.title, content: record.content, brandVersionId,
      currentPublicDestinationUrl: null,
      outputs: record.content.formats.map(format => ({
        format, withdrawnAt:null, templateVersion:siteMarketingTemplateVersions[format],
        publicDestinationUrl:null,
      })),
    } as unknown as MarketingPackageV61Release;
    const html = renderToStaticMarkup(<MarketingPackageReleaseControlsV61 {...base}
      versions={[release]}/>);
    expect(html).toContain("Your materials are up to date");
    expect(buttonFor(html,"Create Updated Materials")).toContain('disabled=""');

    const changed = renderToStaticMarkup(<MarketingPackageReleaseControlsV61 {...base}
      versions={[release]} record={{...record,title:"Updated neighborhood launch"}}/>);
    expect(changed).toContain("Updates available");
    expect(buttonFor(changed,"Create Updated Materials")).not.toContain('disabled=""');
  });

  it("protects archived packages from release and new Brand selection", () => {
    const html = renderToStaticMarkup(<MarketingPackageReleaseControlsV61 {...base}
      record={{...record,status:"archived"}} currentBrand={{id:"new-brand",revision:4}}/>);
    expect(buttonFor(html,"Create Materials")).toContain('disabled=""');
    expect(buttonFor(html,"Use newer Brand")).toContain('disabled=""');
  });
});
