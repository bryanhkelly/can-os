import { readFileSync } from "node:fs";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { nativeClassOperatorQueryKeys } from "@/domain/native-class-operator-query-keys";

const source = (path:string) =>
  readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Launch Studio and /class integration", () => {
  const siteA = "ca270000-0000-4000-8000-000000000002";
  const siteB = "ca270000-0000-4000-8000-000000000003";

  it("shares the same Site-scoped Class cache without sharing different Sites", () => {
    const client = new QueryClient();
    const launchKey = nativeClassOperatorQueryKeys.site(siteA);
    const managerKey = nativeClassOperatorQueryKeys.site(siteA);
    const otherKey = nativeClassOperatorQueryKeys.site(siteB);
    const allSitesKey = nativeClassOperatorQueryKeys.site();
    const listed = [{ classId: "class-1", siteId: siteA }];
    client.setQueryData(launchKey, listed);
    client.setQueryData(otherKey, []);
    client.setQueryData(allSitesKey, [listed[0], { classId: "class-2", siteId: siteB }]);
    expect(client.getQueryData(managerKey)).toEqual(listed);
    expect(managerKey).not.toEqual(otherKey);
    expect(managerKey).not.toEqual(allSitesKey);
    client.clear();
  });

  it("invalidates Site and all-Sites lists after any Class mutation", async () => {
    const client = new QueryClient();
    const keys = [nativeClassOperatorQueryKeys.site(siteA),
      nativeClassOperatorQueryKeys.site(siteB),nativeClassOperatorQueryKeys.site()];
    for(const key of keys) client.setQueryData(key, []);
    await client.invalidateQueries({queryKey:nativeClassOperatorQueryKeys.root});
    for(const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    client.clear();
  });

  it("reuses the same server reader and query keys across both workspaces", () => {
    const launch = source("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    const manager = source("src/components/learning/NativeClassManager.tsx");
    expect(launch).toContain("queryKey:nativeClassOperatorQueryKeys.site(canonicalSiteId)");
    expect(manager).toContain("queryKey:nativeClassOperatorQueryKeys.site(preferredSiteId)");
    expect(manager).toContain("client.invalidateQueries({queryKey:nativeClassOperatorQueryKeys.root})");
    expect(launch).toContain("getMyUnifiedClassDrafts({data:{siteId:canonicalSiteId!}})");
    expect(manager).toContain("getMyUnifiedClassDrafts({data:{siteId:preferredSiteId}})");
    expect(launch).not.toContain('"launch-native-classes"');
  });

  it("checks the Class grant without changing Offering discovery permissions", () => {
    const resolver = source("src/modules/programs/launch-site-catalog.server.ts");
    const commands = source("src/modules/programs/program-discovery.functions.ts");
    const classService = source("src/modules/classes/unified-class.functions.ts");
    expect(resolver).toContain('requiredCapability:"program.launch.start"|"class.manage"="program.launch.start"');
    expect(resolver).toContain("!actor.capabilities.has(requiredCapability)");
    expect(commands).toContain('resolveLaunchSiteCatalogContext(getRequest(),data.siteId,"class.manage")');
    expect(commands).toContain("resolveLaunchSiteCatalogContext(getRequest(),data.publicSiteId)");
    expect(classService).toContain('assertCapability(actor, "class.manage")');
    expect(resolver).toContain('assertSiteSetupScope(publicActor,site,"program.read")');
  });
});
