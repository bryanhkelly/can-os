import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

/** Source contract only. Deployed browser, DB grants and actual enrollment
 * require independent acceptance evidence. */
describe("one native Class route and reusable manager",()=>{
  it("owns discovery and management at /class",()=>{
    const directory=read("src/routes/class.tsx");
    const manager=read("src/components/learning/NativeClassManager.tsx");
    expect(directory).toContain('createFileRoute("/class")');
    expect(directory).toContain("component:ClassHome");
    expect(directory).toContain("<NativeClassManager");
    expect(directory).toContain('view:"manage"');
    expect(manager).toContain("export function NativeClassManager");
    expect(manager).toContain("getNativeClassOperatorSites");
    expect(manager).toContain("publishUnifiedClassOffering");
    expect(manager).not.toContain("createFileRoute");
    expect(manager).not.toContain("Route.useSearch");
  });

  it("reuses /class rather than duplicating class operations",()=>{
    const compatibility=read("src/routes/canonical.classes.tsx");
    expect(compatibility).toContain('<Navigate to="/class"');
    expect(compatibility).not.toContain("createUnifiedClassDraft");
    for(const path of [
      "src/routes/class_.$classId.tsx",
      "src/routes/canonical.program-operations.tsx",
      "src/routes/reports.index.tsx",
      "src/routes/canonical.course-activities.tsx",
      "src/components/launch-studio/SiteNativeClassHandoff.tsx",
    ]){
      expect(read(path)).not.toContain('to="/canonical/classes"');
    }
    const nav=read("src/components/shell/workspace-navigation.registry.ts");
    expect(nav).toContain('path: "/class"');
    expect(nav).not.toContain('path: "/canonical/classes"');
  });

  it("keeps Class evidence within the authorized Class workspace",()=>{
    const detail=read("src/routes/class_.$classId.tsx");
    const manager=read("src/components/learning/NativeClassManager.tsx");
    const legacy=read("src/routes/reports.classes_.$classId.tsx");
    expect(detail).toContain("<NativeClassReportPanel classId={workspace.classId}/>");
    expect(detail).not.toContain('to="/reports/classes/$classId"');
    expect(manager).toContain('search={{view:"manage",tab:"reports"}}');
    expect(legacy).toContain('<Navigate to="/class/$classId"');
    expect(legacy).not.toContain("<NativeClassReportPanel");
  });

  it("promotes governed completion without creating another Class authority",()=>{
    const detail=read("src/routes/class_.$classId.tsx");
    const staging=read("src/routes/canonical.classes_.completion.tsx");
    const permissions=read("src/domain/class-views.ts");
    expect(permissions).toContain('"reports", "completion"');
    expect(detail).toContain('completion:"Completion"');
    expect(detail).toContain("<NativeClassCompletionOperatorPanel classId={workspace.classId}/>");
    expect(staging).toContain('<Navigate to="/class/$classId"');
    expect(staging).toContain('tab:"completion"');
    expect(staging).not.toContain("NativeClassCompletionOperatorPanel");
  });

  it("uses shared 6.1 navigation and the canonical role matrix",()=>{
    const landing=read("src/routes/class.tsx");
    const manage=read("src/components/learning/NativeClassManager.tsx");
    const nav=read("src/components/learning/NativeClassHomeNavigation.tsx");
    expect(landing).toContain("<NativeClassHomeNavigation");
    expect(landing).toContain("<NativeLearnerClasses navigation={navigation}/>");
    expect(manage).toContain("{navigation}");
    expect(nav).toContain('DetailNavigation label="Class workspace sections"');
    expect(nav).toContain("canonicalRoleCapabilities");
    expect(nav).toContain('includes("class.manage")');
    expect(nav).not.toContain("roleCapabilities } from \"@/domain/access-context\"");
  });

  it("checks requested delivery mode before retaining a selected Site",()=>{
    const manager=read("src/components/learning/NativeClassManager.tsx");
    expect(manager).not.toContain("some(mode=>mode===mode)");
    expect(manager).toContain("deliveryOptions.filter(mode=>!selected||selected.localClassPolicy.allowedDeliveryModes.some(allowedMode=>allowedMode===mode))");
    expect(manager).toContain("site.allowedDeliveryModes.some(allowedMode=>allowedMode===mode)");
    expect(manager).toContain("setCreatedClassId(result.classId)");
    expect(manager).toContain("Open newly created Class");
  });

  it("does not open a fake teacher classroom for the synthetic center",()=>{
    const center=read("src/routes/centers.demo.tsx");
    expect(center).toContain('to="/class"');
    expect(center).not.toContain("/centers/demo/classroom");
    expect(center).not.toContain('to="/enrichment/$seasonId"');
    expect(existsSync("src/routes/centers.demo.classroom.tsx")).toBe(false);
    expect(existsSync("src/domain/demo-teacher-intro-video.ts")).toBe(false);
    const reader=read("src/modules/activities/demo-center.functions.ts");
    expect(reader).toContain('site.metadata.synthetic!==true');
    expect(reader).not.toContain("getDemoTeacherRehearsal");
  });

  it("does not mistake enrollment plans for native Classes",()=>{
    const center=read("src/routes/centers.demo.tsx");
    expect(center).toContain("These saved program plans are not native Classes");
    expect(center).toContain("Program plans persist in the database");
    const legacy=read("docs/architecture/native-class-section-retirement.md");
    expect(legacy).toContain("Historical `/classes` Section workflows remain");
  });
});
