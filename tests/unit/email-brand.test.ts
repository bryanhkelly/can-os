import { afterEach, describe, expect, it, vi } from "vitest";
const readSchoolBrand = vi.hoisted(() => vi.fn());
vi.mock("@/modules/sites/school-brand.server", () => ({ readSchoolBrand }));
import { readOptionalEmailBrand } from "@/modules/communication/email-brand.server";

afterEach(() => {
  readSchoolBrand.mockReset();
  vi.restoreAllMocks();
});

describe("shared email brand fallback", () => {
  it("avoids Site storage when no Site is supplied", async () => {
    expect(await readOptionalEmailBrand(undefined, "access-email")).toBeNull();
    expect(readSchoolBrand).not.toHaveBeenCalled();
  });

  it.each(["access-email", "notification-email"] as const)("preserves the canonical brand for %s", async source => {
    const brand = { name: "Test School" };
    readSchoolBrand.mockResolvedValue(brand);
    expect(await readOptionalEmailBrand("site", source)).toBe(brand);
    expect(readSchoolBrand).toHaveBeenCalledWith("site");
  });

  it("preserves the missing Site result without treating it as a storage error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    readSchoolBrand.mockResolvedValue(null);
    expect(await readOptionalEmailBrand("missing", "notification-email")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back on a storage failure without logging the private error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    readSchoolBrand.mockRejectedValue(new Error("private storage detail"));
    expect(await readOptionalEmailBrand("site", "notification-email")).toBeNull();
    expect(warn).toHaveBeenCalledWith("[notification-email] School branding unavailable; using CAN branding");
  });
});
