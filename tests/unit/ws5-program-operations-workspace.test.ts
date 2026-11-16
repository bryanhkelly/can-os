import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text=(name:string)=>readFileSync(name,"utf8");
describe("WS5 scalable and independent Program Operations",()=>{
  it("scopes both Organization and Site before the first bounded Course page",()=>{
    const source=text("src/modules/classes/unified-class.functions.ts");
    expect(source).toContain('getUnifiedClassCourseOptions=createServerFn({method:"GET"})');
    expect(source).toContain('search:z.string().trim().max(100)');
    expect(source).toContain('cursor:z.number().int().min(0).max(100000)');
    expect(source).toContain('ilike(offerings.title,pattern)');
    expect(source).toContain('exists(tx.select({id:educationOperationOrganizationRoles.id})');
    expect(source).toContain('exists(tx.select({id:educationOperationSites.id})');
    expect(source).toContain('inArray(educationOperationSites.siteId,permittedSites)');
    expect(source).toContain('inArray(siteOrganizationRoles.roleCode,["operator","host"])');
    expect(source).toContain('siteByOperation=new Map');
    expect(source).toContain('.limit(pageSize+1).offset(data.cursor)');
    expect(source).not.toContain("await db.transaction(tx=>validateClassAuthority(tx,operator,instance))");
  });
  it("supports exact Site-restricted rollout lookup independently of page-one discovery",()=>{
    const service=text("src/modules/classes/unified-class.functions.ts");
    const route=text("src/routes/canonical.classes.tsx");
    expect(service).toContain('courseVersionIds:z.array(z.string().uuid()).min(1).max(50)');
    expect(service).toContain('if(data.siteId&&!operator.siteIds.includes(data.siteId))');
    expect(service).toContain('data.offeringVersionId?eq(offeringVersions.id,data.offeringVersionId)');
    expect(route).toContain('exactRolloutOptions=useInfiniteQuery');
    expect(route).toContain('offeringVersionId:recipePlan?.offeringVersionId');
    expect(route).toContain('courseVersionIds:recipePlan?.courses.map');
    expect(route).toContain('getNextPageParam:last=>last.nextCursor??undefined');
  });
  it("keeps unfinished enrollment and credit methods out of the WS5 UI",()=>{
    const page=text("src/routes/canonical.classes.tsx");
    const optionSection=page.split('const methodOptions:')[1]?.split('const deliveryOptions=')[0]??"";
    expect(optionSection).toContain('value:"self"');
    expect(optionSection).toContain('value:"assignment"');
    expect(optionSection).toContain('value:"audit"');
    expect(optionSection).not.toContain('value:"invitation"');
    expect(optionSection).not.toContain('value:"approval"');
    expect(optionSection).not.toContain('value:"for_credit"');
    // WS2 owns the server-side publication guard and must be integrated
    // before release. These UI choices alone are not a security gate.
    expect(page).toContain('publishUnifiedClassOffering');
  });
  it("authorizes version impact independently of network membership and limits counts to own Sites",()=>{
    const service=text("src/modules/programs/publisher-version-impact.functions.ts");
    for(const fragment of [
      'assertCapability(actor,"class.manage")',
      'eq(educationOperationOrganizationRoles.organizationId,organizationId)',
      'eq(educationOperationOrganizationRoles.status,"approved")',
      'eq(deploymentOfferingAdoptions.approvalStatus,"approved")',
      'inArray(educationOperationSites.siteId,siteIds)',
      'eq(canonicalClasses.operatingOrganizationId,organizationId)',
      'inArray(canonicalClasses.siteId,siteIds)',
      'localClassImpact:impacts',
      'publishedClassOfferings:publishedListings',
    ])expect(service).toContain(fragment);
    expect(service).not.toContain("networkMembership");
    expect(service).not.toContain("tx.insert");
    expect(service).not.toContain("tx.update");
    expect(service).not.toContain("tx.delete");
  });
  it("registers one operator workspace and preserves publisher/local ownership",()=>{
    const route=text("src/routes/canonical.program-operations.tsx");
    const manifest=JSON.parse(text("docs/platform-route-contracts.json"));
    const nav=text("src/components/shell/workspace-navigation.registry.ts");
    expect(route).toContain('createFileRoute("/canonical/program-operations")');
    expect(route).toContain("projectedRolloutStages");
    expect(route).toContain("getNativeOfferingVersionImpact");
    expect(route).toContain("publisherOwnedFields");
    expect(route).toContain("localClassFields");
    expect(nav).toContain('path: "/canonical/program-operations"');
    expect(manifest.routes.some((row:{route:string;owner:string})=>
      row.route==="/canonical/program-operations"&&row.owner==="programs")).toBe(true);
  });
});
