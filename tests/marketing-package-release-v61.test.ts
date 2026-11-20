import { describe, expect, it } from "vitest";
import { initialMarketingContent } from "../src/domain/marketing-package-v61";
import { packageReleaseChangesV61,packageReleaseIsDownloadableV61 } from "../src/domain/marketing-package-release-v61";
import { buildMarketingPackageZip } from "../src/components/launch-studio/marketing-output-download";

const content={...initialMarketingContent("Riverbend","site-announcement"),
  audiences:["families" as const],formats:["email" as const,"flyer" as const]};
const released={
  brandVersionId:"brand-v3",title:"Community announcement",content,
  complete:true,outputs:[
    {format:"email",withdrawnAt:null},
    {format:"flyer",withdrawnAt:null},
  ],
};
const working={brandVersionId:"brand-v3",title:"Community announcement",content};

describe("atomic Marketing Package release contracts",()=>{
  it("compares the working Package with the whole prior release",()=>{
    expect(packageReleaseChangesV61(working,released)).toEqual([]);
    expect(packageReleaseChangesV61({
      ...working,brandVersionId:"brand-v4",
      content:{...content,message:"Updated community vision",formats:["email","social"]},
    },released)).toEqual(["brand","message","formats"]);
    expect(packageReleaseChangesV61(working,null)).toEqual([]);
  });
  it("treats withdrawn or incomplete outputs as unavailable for a full-package ZIP",()=>{
    expect(packageReleaseIsDownloadableV61(released)).toBe(true);
    expect(packageReleaseIsDownloadableV61({...released,complete:false})).toBe(false);
    expect(packageReleaseIsDownloadableV61({...released,
      outputs:[released.outputs[0]!,{format:"flyer",withdrawnAt:"2026-11-19"}],
    })).toBe(false);
  });
  it("builds a standards-shaped ZIP with correct sizes, CRC and central directory",()=>{
    const archive=buildMarketingPackageZip([{name:"test.txt",body:"123456789"}]);
    const view=new DataView(archive.buffer);
    const name=new TextDecoder().decode(archive.subarray(30,38));
    const original=new TextDecoder().decode(archive.subarray(38,47));
    expect(view.getUint32(0,true)).toBe(0x04034b50);
    expect(view.getUint16(6,true)).toBe(0x0800);
    expect(view.getUint32(14,true)).toBe(0xcbf43926);
    expect(view.getUint32(18,true)).toBe(9);
    expect(name).toBe("test.txt");
    expect(original).toBe("123456789");
    const end=archive.length-22;
    expect(view.getUint32(end,true)).toBe(0x06054b50);
    expect(view.getUint16(end+10,true)).toBe(1);
    expect(view.getUint32(end+16,true)).toBe(47);
  });
  it("rejects duplicate or path-traversing archive names",()=>{
    expect(()=>buildMarketingPackageZip([{name:"../other",body:"x"}])).toThrow();
    expect(()=>buildMarketingPackageZip([
      {name:"flyer.svg",body:"a"},{name:"flyer.svg",body:"b"},
    ])).toThrow();
  });
});
