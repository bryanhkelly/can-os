import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const published=readFileSync(new URL("../../src/modules/blueprints/blueprint-published-readonly.server.ts",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../../src/modules/blueprints/blueprint-workspace.server.ts",import.meta.url),"utf8");

describe("Published Solution discovery has separate read-only authority",()=>{
  it("routes readers without configure privilege into a published-only workspace",()=>{
    expect(workspace).toContain('if(!context.capabilities.has("blueprint.configure"))');
    expect(workspace).toContain("getPublishedSolutionWorkspaceReadOnly(context,siteId)");
  });
  it("restricts the reader to an exact current Site operator and published definitions",()=>{
    expect(published).toContain('assertCapability(context,"blueprint.read")');
    expect(published).toContain("siteOrganizationRoles.siteId,siteId");
    expect(published).toContain('eq(blueprints.status,"active")');
    expect(published).toContain('eq(blueprintVersions.lifecycle,"published")');
    expect(published).toContain("publicSolutionComponentDescription(componentSpec)");
  });
  it("never returns Site configuration drafts, approval grants or private Blueprint specs",()=>{
    expect(published).toContain("configurations:[]");
    expect(published).toContain("canConfigure:false,canReview:false,canExecute:false");
    expect(published).not.toContain("blueprintConfigurationVersions");
  });
});
