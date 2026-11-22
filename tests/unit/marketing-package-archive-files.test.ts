import { describe, expect, it } from "vitest";
import { initialMarketingContent } from "@/domain/marketing-package-v61";
import { marketingPackageArchiveFiles } from "@/components/launch-studio/marketing-package-archive-files";
import type { getSiteMarketingReleaseOutput, listSiteMarketingPackageReleases } from "@/modules/programs/site-marketing-artifacts.functions";

type Release = Awaited<ReturnType<typeof listSiteMarketingPackageReleases>>[number];
type Output = Awaited<ReturnType<typeof getSiteMarketingReleaseOutput>>;

function fixture() {
  const content={...initialMarketingContent("Example Site","site-announcement"),formats:["email","flyer"] as ["email","flyer"]};
  const release={
    id:"release-a",releaseNumber:2,brandVersionId:"brand-v2",
    packageRevision:7,createdAt:"2026-11-22T00:00:00.000Z",
    title:"Outreach example",content,formats:content.formats,complete:true,
    outputs:[
      {id:"a",format:"email",withdrawnAt:null,templateVersion:3,checksum:"hash-a"},
      {id:"b",format:"flyer",withdrawnAt:null,templateVersion:4,checksum:"hash-b"},
    ],
  } as unknown as Release;
  const outputs=[
    {fileName:"message.html",content:"Frozen email",mimeType:"text/html"},
    {fileName:"flyer.svg",content:"Frozen flyer",mimeType:"image/svg+xml"},
  ] as unknown as Output[];
  return {release,outputs};
}

describe("immutable Marketing Package archive projection",()=>{
  it("assembles exactly the saved release bytes, format filenames, and manifest",()=>{
    const {release,outputs}=fixture();
    const files=marketingPackageArchiveFiles(release,outputs);
    expect(files.map(file=>file.name)).toEqual([
      "email.html","flyer.svg","package-manifest.json",
    ]);
    expect(files[0]?.body).toBe("Frozen email");
    const manifest=JSON.parse(files[2]!.body);
    expect(manifest).toMatchObject({
      packageReleaseId:"release-a",releaseNumber:2,brandVersionId:"brand-v2",
      sourcePackageRevision:7,
      outputs:[{id:"a",sha256:"hash-a"},{id:"b",sha256:"hash-b"}],
    });
  });

  it("refuses partial output lists or incomplete release projections",()=>{
    const {release,outputs}=fixture();
    expect(()=>marketingPackageArchiveFiles(release,outputs.slice(0,1))).toThrow("Complete original");
    expect(()=>marketingPackageArchiveFiles({...release,complete:false},outputs)).toThrow("Complete original");
  });

  it("includes only the frozen social caption when the Release contains social output",()=>{
    const {release,outputs}=fixture();
    const socialRelease={...release,
      content:{...release.content,formats:["email","social"] as ["email","social"]},
      formats:["email","social"],
      outputs:[release.outputs[0]!,{...release.outputs[1]!,format:"social"}],
    } as unknown as Release;
    const socialOutputs=[
      outputs[0]!,{...outputs[1]!,plainText:"Original caption"},
    ] as Output[];
    expect(marketingPackageArchiveFiles(socialRelease,socialOutputs).map(file=>file.name))
      .toEqual(["email.html","social.svg","social-caption.txt","package-manifest.json"]);
  });
});
