import type { Locator, Page } from "@playwright/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectProtectedPageDenied,
  expectVisibleAfterReload,
} from "../e2e/helpers/golden-flow-assertions";

const { playwrightExpect } = vi.hoisted(() => ({ playwrightExpect: vi.fn() }));
vi.mock("@playwright/test", () => ({ expect: playwrightExpect }));

type FakeLocator = {
  assertVisible: () => Promise<void>;
  assertContains: (expected: string | RegExp) => Promise<void>;
};

beforeEach(() => {
  playwrightExpect.mockReset();
  playwrightExpect.mockImplementation((actual: unknown) => {
    if (typeof actual === "string") {
      return {
        not: {
          toContain: (expected: string) => {
            if (actual.includes(expected)) throw new Error(`Protected content leaked: ${expected}`);
          },
        },
      };
    }
    const locator = actual as FakeLocator;
    return {
      toBeVisible: () => locator.assertVisible(),
      toContainText: (expected: string | RegExp) => locator.assertContains(expected),
    };
  });
});

describe("GoldenFlow browser assertions", () => {
  it("checks visible state only after a real reload", async () => {
    const calls: string[] = [];
    const page = {
      reload: vi.fn(async () => { calls.push("reload"); }),
    } as unknown as Page;
    const target = {
      assertVisible: async () => { calls.push("visible"); },
    } as unknown as Locator;

    await expectVisibleAfterReload(page, target);

    expect(calls).toEqual(["reload", "visible"]);
  });

  it("requires the canonical denial and excludes protected response content", async () => {
    const page = {
      goto: vi.fn(async () => ({
        text: async () => "<main>Teacher-only materials are unavailable</main>",
      })),
    } as unknown as Page;
    const denial = {
      assertVisible: vi.fn(),
      assertContains: vi.fn(async () => undefined),
    } as unknown as Locator;

    await expectProtectedPageDenied(page, "/classes?tab=teacher-guide", {
      denial,
      message: "Teacher-only materials are unavailable",
      protectedContent: ["Assessment answer guides"],
    });

    expect(page.goto).toHaveBeenCalledWith("/classes?tab=teacher-guide");
    expect(denial.assertContains).toHaveBeenCalledWith("Teacher-only materials are unavailable");
  });

  it("fails negative authorization when protected content appears in the document", async () => {
    const page = {
      goto: vi.fn(async () => ({
        text: async () => "<main>Assessment answer guides</main>",
      })),
    } as unknown as Page;
    const denial = {
      assertVisible: vi.fn(async () => undefined),
    } as unknown as Locator;

    await expect(expectProtectedPageDenied(page, "/classes?tab=teacher-guide", {
      denial,
      protectedContent: ["Assessment answer guides"],
    })).rejects.toThrow("Protected content leaked");
  });
});
