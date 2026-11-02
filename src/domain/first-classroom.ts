import { readClassContent } from "./class-content";
import { hasAccessibleFirstLesson, isLearnerFacingInstruction } from "./first-class-lesson";

/** Discovery facts only. Installing, licensing and adopting remain explicit commands. */
export function recommendCourseOption(input: {
  origin: "institution_owned" | "adopted";
  published: boolean;
  licenseActive: boolean;
  adoptionActive: boolean;
  curriculum: Record<string, unknown>;
}) {
  const owned = input.origin === "institution_owned";
  const accessReady = input.published && (owned || input.licenseActive && input.adoptionActive);
  const instructionReady = accessReady && hasAccessibleFirstLesson(input.curriculum);
  return {
    available: input.published,
    licensed: owned ? null : input.licenseActive,
    adopted: owned ? null : input.adoptionActive,
    accessReady,
    instructionReady,
    recommended: instructionReady,
    explanation: !input.published
      ? "This course version is not published."
      : !owned && !input.licenseActive
        ? "An active organization license is required before adoption."
        : !owned && !input.adoptionActive
          ? "An authorized adoption for this program is required before provisioning."
          : !hasAccessibleFirstLesson(input.curriculum)
            ? "Published, but it still needs a learner-facing lesson with reading, practice or a resource."
            : owned
              ? "Institution-owned and ready to provision with real introductory instruction."
              : "Licensed, adopted and ready to provision with real introductory instruction.",
  };
}

export type FirstClassBlocker = {
  key: "inactive_section" | "curriculum_unavailable" | "missing_lesson" | "missing_assessment" | "missing_qualified_teacher" | "missing_students";
  message: string;
};

export type FirstClassAssessment = {
  id: string;
  title: string;
  instructions: string | null;
  /** Canonical lesson link recorded at authoring time; null for unlinked work. */
  curriculumLessonId: string | null;
};

/** Readiness is derived from actual instructional and membership records, never persisted as a badge. */
export function buildFirstClassroom(sectionId: string, input: {
  sectionActive: boolean;
  courseVersionPublished: boolean;
  curriculumAccess: { available: boolean; reason: string | null };
  curriculum: Record<string, unknown>;
  qualifiedTeacher: boolean;
  activeStudentCount: number;
  publishedAssessments: readonly FirstClassAssessment[];
}) {
  const content = input.courseVersionPublished && input.curriculumAccess.available ? readClassContent(input.curriculum) : null;
  const lesson = content?.modules.flatMap(module => module.lessons).find(isLearnerFacingInstruction) ?? null;
  // The suggested first assignment must belong to the lesson the student is
  // told to study. Prefer the published assessment explicitly authored for
  // that lesson over an unrelated earlier-created one; unlinked published
  // work for this class remains an acceptable fallback.
  const submittable = input.publishedAssessments.filter(item => Boolean(item.instructions?.trim()));
  const assessment = (lesson ? submittable.find(item => item.curriculumLessonId === lesson.id) : undefined)
    ?? (lesson ? submittable.find(item => item.curriculumLessonId === null) : undefined) ?? null;
  const blockers: FirstClassBlocker[] = [];
  if (!input.sectionActive) blockers.push({ key: "inactive_section", message: "Activate this class before beginning instruction." });
  if (!input.curriculumAccess.available) blockers.push({ key: "curriculum_unavailable",
    message: input.curriculumAccess.reason ?? "Current curriculum delivery access is required." });
  if (!lesson && input.curriculumAccess.available) blockers.push({ key: "missing_lesson", message: "Publish a learner-facing lesson with reading, practice or a resource." });
  if (!assessment && input.curriculumAccess.available) blockers.push({ key: "missing_assessment", message: "Publish available work with student instructions linked to the first lesson, or an unlinked introductory assessment." });
  if (!input.qualifiedTeacher) blockers.push({ key: "missing_qualified_teacher", message: "Assign an eligible teacher whose verified qualifications and delivery cover the instructional window." });
  if (input.activeStudentCount < 1) blockers.push({ key: "missing_students", message: "Assign at least one actively enrolled student to this class for the same program and school year." });
  return {
    sectionId,
    ready: blockers.length === 0,
    blockers,
    activeStudentCount: input.activeStudentCount,
    firstWeek: {
      lesson: lesson ? { id: lesson.id, title: lesson.title } : null,
      assessment: assessment ? { id: assessment.id, title: assessment.title } : null,
    },
  };
}

export type FirstClassroom = ReturnType<typeof buildFirstClassroom>;
