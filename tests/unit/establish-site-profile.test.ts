import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  saveSiteProfileSequentially, SiteProfileSaveError,
} from "@/components/launch-studio/site-profile-persistence";

const source = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("Establish / Site Profile canonical handoff", () => {
  it("mounts one unified Site form in the Site-scoped Launch Studio route", () => {
    const route = source("src/routes/launch.site.tsx");
    const form = source("src/components/launch-studio/EstablishSiteProfileUnified.tsx");
    expect(route).toContain('selected?.id === "site-profile"');
    expect(route).toContain("<EstablishSiteProfileUnified");
    expect(route).toContain("organizations: options.organizations");
    expect(route).toContain("site: site ?? null");
    expect(form).toContain("Save &amp; Continue");
    expect(form).toContain("Save &amp; Exit");
    expect(form).toContain("useLaunchUnsavedChanges");
    expect(form).toContain("LaunchSiteAddressFields");
    expect(form).toContain("SiteTimezoneField");
    expect(form).not.toContain("createSite");
    expect(form).not.toContain("Promise.all");
  });

  it("uses the shared V6.1 page structure and controls without new native widgets", () => {
    const route = source("src/routes/launch.site.tsx");
    const form = source("src/components/launch-studio/EstablishSiteProfileUnified.tsx");
    const frame = source("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    expect(route).toContain("<WorkspaceShell");
    expect(route).not.toMatch(/<(?:main|h1)(?:\\s|>)/);
    expect(form).toContain("<Label");
    expect(form).not.toMatch(/<(?:label|button|input|select|textarea)(?:\\s|>)/);
    expect(frame).toContain('<Button type="button" variant="ghost"');
    expect(frame).not.toMatch(/<button(?:\\s|>)/);
  });

  it("locks shared time zone and location editors during save and reconciliation", () => {
    const form = source("src/components/launch-studio/EstablishSiteProfileUnified.tsx");
    const zone = source("src/components/workspace/SiteTimezoneField.tsx");
    const address = source("src/components/operations/LaunchSiteAddressFields.tsx");
    expect(form).toContain("disabled={saving || reloadRequired}");
    expect(zone).toContain("disabled={disabled}");
    expect(address).toContain("disabled={disabled}");
  });

  it("retains the V6.1 public landing exception only for the current Site route", () => {
    const eslint = source("eslint.config.mjs");
    expect(eslint).toContain("site.new}.tsx");
    expect(eslint).not.toContain("schools.new}.tsx");
  });

  it("chains the three canonical operations in order without parallel writes", async () => {
    const calls: string[] = [];
    const identity = vi.fn(async (revision: string) => {
      calls.push("identity:" + revision);
      return { revision: "rev-1" };
    });
    const contact = vi.fn(async (revision: string) => {
      calls.push("contact:" + revision);
      return { revision: "rev-2" };
    });
    const address = vi.fn(async (revision: string) => {
      calls.push("address:" + revision);
      return { revision: "rev-3" };
    });
    const finalRevision = await saveSiteProfileSequentially("rev-0", [identity, contact, address]);
    expect(calls).toEqual(["identity:rev-0", "contact:rev-1", "address:rev-2"]);
    expect(finalRevision).toBe("rev-3");
    expect(identity).toHaveBeenCalledOnce();
    expect(contact).toHaveBeenCalledOnce();
    expect(address).toHaveBeenCalledOnce();
  });

  it("permits a new Site to proceed with no optional writes", async () => {
    await expect(saveSiteProfileSequentially("rev-0", [])).resolves.toBe("rev-0");
  });

  it("stops on a second-command conflict without running or retrying later commands", async () => {
    const conflict = new Error("Site revision has changed.");
    const first = vi.fn(async () => ({ revision: "rev-1" }));
    const second = vi.fn(async () => { throw conflict; });
    const third = vi.fn(async () => ({ revision: "rev-3" }));
    await expect(saveSiteProfileSequentially("rev-0", [first, second, third]))
      .rejects.toMatchObject({ name: "SiteProfileSaveError", completed: 1, originalError: conflict });
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(third).not.toHaveBeenCalled();
  });

  it("reports a first-command failure without implying a partial write", async () => {
    const originalError = new Error("Not authorized");
    try {
      await saveSiteProfileSequentially("rev-0", [async () => { throw originalError; }]);
      throw new Error("Expected a rejected save");
    } catch (error) {
      expect(error).toBeInstanceOf(SiteProfileSaveError);
      expect(error).toMatchObject({ completed: 0, originalError });
    }
  });

  it("fails closed when a command does not return a new revision", async () => {
    await expect(saveSiteProfileSequentially("rev-0", [
      async () => ({ revision: "" }),
    ])).rejects.toMatchObject({ completed: 0 });
  });
});
