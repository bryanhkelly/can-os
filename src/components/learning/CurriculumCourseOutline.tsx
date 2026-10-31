import type { getCurriculumMarketplace } from "@/modules/learning/curriculum-marketplace.functions";

type Marketplace = Awaited<ReturnType<typeof getCurriculumMarketplace>>;
type Course = Marketplace["packs"][number]["courses"][number];

/** Only publisher-provided discovery metadata; never restricted lesson bodies. */
export function CurriculumCourseOutline({ courses }: { courses: readonly Course[] }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer underline">Review included courses and outlines</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Discovery previews show publisher-provided course structure, not lesson text, restricted teacher guides, or a guarantee of academic credit.
      </p>
      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {courses.map((course) => (
          <li key={course.courseVersionId} className="rounded border p-3">
            <p className="font-medium">{course.code}: {course.title} · {course.subject}</p>
            <p className="mt-2 text-xs font-semibold">
              {course.recommendation.recommended ? "Recommended first-class option" : "Not yet recommended"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{course.recommendation.explanation}</p>
            <p className="mt-1 text-xs">
              Available · {course.recommendation.licensed ? "Licensed" : "License needed"} ·{" "}
              {course.recommendation.adopted ? "Adopted" : "Adoption needed"} ·{" "}
              {course.recommendation.instructionReady ? "Instruction-ready" : "Lesson needed"}
            </p>
            {course.preview ? (
              <details className="mt-2">
                <summary className="cursor-pointer underline">
                  {course.preview.moduleCount} units · {course.preview.lessonCount} lessons
                  {course.preview.weeksPlanned ? ` · ${course.preview.weeksPlanned} planned instructional weeks` : ""}
                </summary>
                {course.preview.syllabusSummary && (
                  <p className="mt-2 whitespace-pre-wrap text-xs">
                    {course.preview.syllabusSummary}
                    {course.preview.syllabusSummary.length === 240 ? "…" : ""}
                  </p>
                )}
                <ol className="mt-2 list-inside list-decimal space-y-2">
                  {course.preview.modules.map((module) => (
                    <li key={module.id}>
                      <span className="font-medium">{module.title} · {module.lessonCount} lessons</span>
                      {module.lessonTitles.length > 0 && (
                        <p className="ml-5 text-xs text-muted-foreground">
                          {module.lessonTitles.join(" · ")}
                          {module.lessonCount > module.lessonTitles.length ? " …" : ""}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
                {course.preview.outlineTruncated && (
                  <p className="mt-2 text-xs text-muted-foreground">Additional units omitted from this preview.</p>
                )}
              </details>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Publisher course outline not yet available for review.</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
