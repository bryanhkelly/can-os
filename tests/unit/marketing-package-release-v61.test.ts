import { describe, expect, it } from "vitest";
import {
  packageReleaseChangesV61, packageReleaseIsDownloadableV61,
  type PackageReleaseReferenceV61, type PackageWorkingStateV61,
} from "@/domain/marketing-package-release-v61";
import { initialMarketingContent } from "@/domain/marketing-package-v61";

const brandA="11111111-1111-4111-8111-111111111111";
const brandB="22222222-2222-4222-8222-222222222222";

function makeFixture(){
  const content={
    ...initialMarketingContent("Riverbend Academy","site-announcement"),
    audiences:["families","community"] as Array<"families"|"community">,
    formats:["email","flyer","social"] as Array<"email"|"flyer"|"social">,
  };
  const working:PackageWorkingStateV61={brandVersionId:brandA,title:"Neighborhood launch",content};
  const release:PackageReleaseReferenceV61={
    brandVersionId:brandA,title:working.title,content:{...content},
    complete:true,
    outputs:content.formats.map(format=>({format,withdrawnAt:null})),
  };
  return {working,release};
}

describe("Launch V6.1 immutable Marketing Package Release",()=>{
  it("compares actual saved content, not an unrelated package revision",()=>{
    const {working,release}=makeFixture();
    expect(packageReleaseChangesV61(working,release)).toEqual([]);
    expect(packageReleaseChangesV61(working,null)).toEqual([]);
    expect(packageReleaseChangesV61({...working,content:{
      ...working.content,headline:"A new community plan",
    }},release)).toEqual(["message"]);
  });

  it("recognizes all distinct reasons to create an updated whole-Package release",()=>{
    const {working,release}=makeFixture();
    const modified:PackageWorkingStateV61={
      brandVersionId:brandB,title:"Updated launch",
      content:{...working.content,
        headline:"New headline",audiences:["families"],formats:["email"],
        geography:"East side",
      },
    };
    expect(packageReleaseChangesV61(modified,release)).toEqual([
      "brand","message","audiences","formats","details",
    ]);
  });

  it("does not treat audience and format ordering alone as a material change",()=>{
    const {working,release}=makeFixture();
    const reordered:PackageWorkingStateV61={...working,content:{
      ...working.content,
      audiences:[...working.content.audiences].reverse(),
      formats:[...working.content.formats].reverse(),
    }};
    expect(packageReleaseChangesV61(reordered,release)).toEqual([]);
  });

  it("downloads complete snapshots only, with no withdrawn outputs",()=>{
    const {release}=makeFixture();
    expect(packageReleaseIsDownloadableV61(release)).toBe(true);
    expect(packageReleaseIsDownloadableV61({...release,complete:false})).toBe(false);
    expect(packageReleaseIsDownloadableV61({...release,outputs:release.outputs.slice(1)})).toBe(false);
    expect(packageReleaseIsDownloadableV61({...release,outputs:release.outputs.map((output,index)=>
      index===0?{...output,withdrawnAt:"2026-11-19T00:00:00.000Z"}:output)})).toBe(false);
  });

  it("does not allow an output count to mask missing or duplicated selected formats",()=>{
    const {release}=makeFixture();
    const missingAndDuplicated={...release,outputs:[
      {format:"email",withdrawnAt:null},
      {format:"flyer",withdrawnAt:null},
      {format:"flyer",withdrawnAt:null},
    ]};
    expect(packageReleaseIsDownloadableV61(missingAndDuplicated)).toBe(false);
  });
});
