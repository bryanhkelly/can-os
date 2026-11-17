import { describe, expect, it } from "vitest";
import { canonicalRoleCapabilities } from "@/domain/canonical-access";
import { selectClassTab, selectClassView } from "@/domain/class-views";

describe("promoted /class navigation authority",()=>{
  it("shows Class management capability only for authorized canonical staff roles",()=>{
    expect(canonicalRoleCapabilities.site_admin).toContain("class.manage");
    expect(canonicalRoleCapabilities.registrar).toContain("class.manage");
    expect(canonicalRoleCapabilities.learner).not.toContain("class.manage");
    expect(canonicalRoleCapabilities.room_facilitator).not.toContain("class.manage");
  });

  it("accepts governed completion only in a verified Class management view",()=>{
    expect(selectClassTab("manage","completion")).toBe("completion");
    expect(()=>selectClassTab("learn","completion")).toThrow();
    expect(()=>selectClassTab("teach","completion")).toThrow();
  });

  it("cannot elevate a learning relationship by choosing a management URL",()=>{
    expect(()=>selectClassView("manage",{
      learn:true,teach:false,manage:false,
    })).toThrow();
    expect(selectClassView("manage",{
      learn:false,teach:false,manage:true,
    })).toBe("manage");
  });
});
