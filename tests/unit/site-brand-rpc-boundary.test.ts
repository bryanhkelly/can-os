import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) =>
  readFileSync(new URL("../../" + file, import.meta.url), "utf8");

describe("Site Brand client/server execution boundary", () => {
  const rpc = source("src/modules/sites/site-brand.functions.ts");
  const server = source("src/modules/sites/site-brand.server.ts");
  const schemas = source("src/modules/sites/site-brand.schemas.ts");

  it("exposes Brand commands as RPC wrappers, not browser-reachable database helpers", () => {
    for (const name of ["readSiteBrandVersionView", "saveSiteBrandVersion", "revokeSiteBrandAsset"]) {
      expect(rpc).toContain("export const " + name + "=createServerFn");
    }
    for (const forbidden of [
      "export async function readSavedBrandVersion",
      "export async function saveSiteBrandVersionWithinTransaction",
      "requirePartnerWebsiteEditor",
      'from "@/db/client"',
      'from "node:crypto"',
      'from "@tanstack/react-start/server"',
    ]) {
      expect(rpc).not.toContain(forbidden);
    }
    expect(rpc).toContain("readSiteBrandVersionViewServer(data)");
    expect(rpc).toContain("saveSiteBrandVersionServer(data)");
    expect(rpc).toContain("revokeSiteBrandAssetServer(data)");
  });

  it("keeps authorization, auditable transactions, and preview revocation on server", () => {
    expect(server).toContain("requirePartnerWebsiteEditor");
    expect(server).toContain("assertSiteSetupScope");
    expect(server).toContain("readSavedBrandVersion");
    expect(server).toContain("saveSiteBrandVersionWithinTransaction");
    expect(server).toContain("writeAudit");
    expect(server).toContain("websitePreviewSharesV1");
    expect(server).toContain("db.transaction");
    expect(server).not.toContain("createServerFn");
  });

  it("shares only validation and types across environments", () => {
    expect(schemas).toContain("export const assetInputSchema");
    expect(schemas).toContain("export const mutationSchema");
    expect(schemas).toContain("export type SiteBrandSaveInput");
    for (const forbidden of ["@/db/client", "site-website-authorization.server", "getRequest", "node:crypto"]) {
      expect(schemas).not.toContain(forbidden);
    }
  });

  it("does not re-import privileged Site Brand helpers through the RPC module", () => {
    for (const file of [
      "src/modules/sites/school-brand.server.ts",
      "src/modules/sites/site-public-catalog.server.ts",
      "src/modules/sites/site-publication.server.ts",
      "src/modules/sites/site-website-preview.server.ts",
      "src/modules/sites/site-family-brand.server.ts",
      "src/modules/sites/site-preview-sharing.functions.ts",
      "src/modules/sites/site-website-preview.functions.ts",
      "src/modules/enrollment/family-invitations.server.ts",
      "src/modules/programs/site-marketing-artifacts.functions.ts",
      "src/routes/launch.site-preview.ts",
    ]) {
      const content = source(file);
      const lines = content.split("\n").filter(line =>
        line.includes("readSavedBrandVersion") || line.includes("saveSiteBrandVersionWithinTransaction"));
      expect(lines.length, file).toBeGreaterThan(0);
      expect(content, file).toContain("site-brand.server");
    }
  });
});
