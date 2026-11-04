import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement("a", { href: to }, children),
}));

import { StudentProfileEditor } from "@/components/profiles/StudentProfileSetup";
import type { getStudentSelfProfile } from "@/modules/profiles/student-self-profile.functions";

vi.mock("@/modules/profiles/student-self-profile.functions", () => ({
  getStudentSelfProfile: vi.fn(),
  saveStudentSelfProfile: vi.fn(),
}));

describe("student profile setup view", () => {
  it("offers a lightweight optional setup and leaves school-managed identity alone", () => {
    const snapshot: Awaited<ReturnType<typeof getStudentSelfProfile>> = {
      preferredName: "",
      preferredPronouns: "",
      interests: [],
    };
    const html = renderToStaticMarkup(
      <StudentProfileEditor snapshot={snapshot} changed={vi.fn()} />,
    );

    expect(html).toContain("Preferred name (optional)");
    expect(html).toContain("Pronouns (optional)");
    expect(html).toContain("Interests or hobbies (optional)");
    expect(html).toContain("Add or change your profile picture above");
    expect(html).toContain("Your school manages your legal identity, grade, enrollment, and access.");
    expect(html).toContain("Save student profile");
    expect(html).toContain("Skip for now and go to my learning workspace");
  });
});
