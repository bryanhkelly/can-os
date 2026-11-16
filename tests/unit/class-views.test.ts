import { describe, expect, it } from "vitest";
import {
  permittedClassViews, selectClassView, selectClassTab,
  classTabs, type ClassPermissions,
} from "@/domain/class-views";

const learner:ClassPermissions={learn:true,teach:false,manage:false};
const instructor:ClassPermissions={learn:false,teach:true,manage:false};
const operator:ClassPermissions={learn:false,teach:false,manage:true};

describe("one Class URL with verified role-aware perspectives",()=>{
  it("opens the correct default view based solely on current authorized relationships",()=>{
    expect(selectClassView(undefined,learner)).toBe("learn");
    expect(selectClassView(undefined,instructor)).toBe("teach");
    expect(selectClassView(undefined,operator)).toBe("manage");
    expect(selectClassView(undefined,{learn:true,teach:true,manage:true})).toBe("learn");
  });
  it("never grants a teaching or management view from a modified query parameter",()=>{
    expect(()=>selectClassView("teach",learner)).toThrow();
    expect(()=>selectClassView("manage",learner)).toThrow();
    expect(()=>selectClassView("learn",operator)).toThrow();
    expect(()=>selectClassView(undefined,{learn:false,teach:false,manage:false})).toThrow();
  });
  it("supports switching perspectives only when multiple relationships were verified",()=>{
    const both:ClassPermissions={learn:false,teach:true,manage:true};
    expect(permittedClassViews(both)).toEqual(["teach","manage"]);
    expect(selectClassView("manage",both)).toBe("manage");
    expect(selectClassView("teach",both)).toBe("teach");
    expect(()=>selectClassView("learn",both)).toThrow();
  });
  it("limits tabs to the selected perspective, never to query-based privilege",()=>{
    expect(selectClassTab("learn",undefined)).toBe("lessons");
    expect(selectClassTab("teach",undefined)).toBe("overview");
    expect(selectClassTab("manage",undefined)).toBe("overview");
    expect(selectClassTab("learn","progress")).toBe("progress");
    expect(selectClassTab("teach","classroom")).toBe("classroom");
    expect(selectClassTab("manage","roster")).toBe("roster");
    expect(()=>selectClassTab("learn","roster")).toThrow();
    expect(()=>selectClassTab("teach","offering")).toThrow();
    expect(()=>selectClassTab("manage","assignments")).toThrow();
    expect(classTabs.learn).not.toContain("roster");
  });
});
