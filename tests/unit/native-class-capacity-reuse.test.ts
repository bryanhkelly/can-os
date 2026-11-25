import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
import {nativeClassConsentDigest} from "@/modules/classes/native-class-consent.server";

const mocks=vi.hoisted(()=>({count:vi.fn(()=> "count"),eq:vi.fn((field:string,value:unknown)=>({field,value})),inArray:vi.fn((field:string,values:unknown)=>({field,values})),and:vi.fn((...conditions:unknown[])=>conditions)}));
vi.mock("drizzle-orm",()=>mocks);
vi.mock("@/db/canonical-v301",()=>({canonicalClassEnrollments:{classId:"classId",status:"status"}}));
import {readNativeClassOccupancy} from "@/modules/classes/native-class-capacity.server";

describe("canonical Class capacity and consent reuse",()=>{
  it("counts only active and pending seats for the exact Class",async()=>{
    const where=vi.fn(async()=>[{total:7}]);
    const from=vi.fn(()=>({where}));
    const reader={select:vi.fn(()=>({from}))} as unknown as Parameters<typeof readNativeClassOccupancy>[0];
    expect(await readNativeClassOccupancy(reader,"class-a")).toBe(7);
    expect(mocks.eq).toHaveBeenCalledWith("classId","class-a");
    expect(mocks.inArray).toHaveBeenCalledWith("status",["pending","active"]);
    expect(where).toHaveBeenCalledWith([{field:"classId",value:"class-a"},{field:"status",values:["pending","active"]}]);
  });
  it("preserves zero occupancy",async()=>{
    const reader={select:()=>({from:()=>({where:async()=>[{total:0}]})})} as unknown as Parameters<typeof readNativeClassOccupancy>[0];
    expect(await readNativeClassOccupancy(reader,"empty")).toBe(0);
  });
  it("preserves the historical consent digest including Unicode and whitespace",()=>{
    const version="v1";
    const text="I agree.\n café ";
    expect(nativeClassConsentDigest(version,text)).toBe(createHash("sha256").update(version).update("\u0000").update(text).digest("hex"));
    expect(nativeClassConsentDigest(version,text)).not.toBe(createHash("sha256").update(version+"\n"+text).digest("hex"));
    expect(nativeClassConsentDigest(version,text)).not.toBe(nativeClassConsentDigest(version,text.trim()));
    expect(nativeClassConsentDigest(version,text)).not.toBe(nativeClassConsentDigest("v2",text));
  });
  it("requires every current enrollment method to share the Class occupancy reader",()=>{
    const files=[
      ["src/modules/classes/native-class-enrollment.functions.ts",3],
      ["src/modules/classes/native-class-assignment.functions.ts",1],
      ["src/modules/classes/native-class-transfers.functions.ts",1],
      ["src/modules/classes/native-class-guardian-enrollment.functions.ts",1],
      ["src/modules/enrollment/course-class-placement.server.ts",2],
    ] as const;
    for(const [path,calls] of files){
      const source=readFileSync(path,"utf8");
      expect(source.match(/readNativeClassOccupancy\(tx,/g)).toHaveLength(calls);
      expect(source).not.toContain("total:count()");
      expect(source).toContain("assertNativeClassSeatAvailable(");
      if(/native-class-(enrollment|transfers|guardian-enrollment)\.functions/.test(path)){
        expect(source).toContain("consentSha256=nativeClassConsentDigest(");
        expect(source).not.toContain('createHash("sha256")');
      }
    }
  });
});
