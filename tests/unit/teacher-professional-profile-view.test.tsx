import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  TeacherProfessionalProfile,
  TeacherProfessionalProfileEditor,
} from "@/components/profiles/TeacherProfessionalProfile";
import type { getTeacherProfessionalProfile } from "@/modules/profiles/teacher-professional-profile.functions";

vi.mock("@/modules/profiles/teacher-professional-profile.functions", () => ({
  getTeacherProfessionalProfile: vi.fn(),
  saveTeacherProfessionalProfile: vi.fn(),
}));

type Snapshot = Awaited<ReturnType<typeof getTeacherProfessionalProfile>>;

describe("teacher professional profile editor", () => {
  it("labels background as optional and keeps credentials in the review workflow", () => {
    const snapshot: Snapshot = {
      education: [{
        institution: "North College",
        degree: "M.Ed.",
        fieldOfStudy: "Mathematics Education",
        graduationYear: 2018,
      }],
      teachingExperienceYears: null,
      specialties: [],
      updatedAt: null,
    };
    const html = renderToStaticMarkup(
      <TeacherProfessionalProfileEditor snapshot={snapshot} changed={vi.fn()} />,
    );
    const intro = renderToStaticMarkup(<TeacherProfessionalProfile />);

    expect(html).toContain("Years of teaching experience");
    expect(html).toContain("University or institution");
    expect(html).toContain("Subject or specialty areas");
    expect(html).toContain("Save professional background");
    expect((html.match(/type="button"/g) ?? [])).toHaveLength(2);
    expect(intro).toContain("Optional, self-reported education and experience.");
    expect(intro).toContain("Licenses, certificates");
  });
});
