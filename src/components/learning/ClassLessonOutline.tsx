import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";
import type { ClassContent } from "@/domain/class-content";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { CourseLessonProgress } from "./CourseLessonProgress";
import { UnifiedLessonOutline } from "./UnifiedLessonOutline";

/** Academic Classes share exactly the same lesson outline rendering as
 * native Classes and recorded instruction; school navigation remains scoped
 * to the current authorized Section and student. */
export function ClassLessonOutline({ content, search, currentLessonId, completed, showCompletion }: {
  content: ClassContent | null; search: { section: string; student?: string };
  currentLessonId?: string; completed: ReadonlySet<string>; showCompletion: boolean;
}) {
  const published = content?.modules.flatMap(module =>
    module.lessons.filter(isLearnerFacingInstruction).map(lesson=>({
      id:lesson.id,title:lesson.title,group:module.title,
      detail:lesson.estimatedMinutes?lesson.estimatedMinutes+" min":"Published lesson",
      status:(showCompletion&&completed.has(lesson.id)?"completed":"not_started") as "completed"|"not_started",
    })),
  )??[];
  const completedCount=published.filter(item=>item.status==="completed").length;
  return <WorkspacePanel title="Lesson outline" className="classroom-outline-panel"
    actions={published.length>0?<span className="text-xs text-muted-foreground">
      {showCompletion?completedCount+" / "+published.length:published.length+" lessons"}
    </span>:undefined}>
    {!content&&<p className="text-sm text-muted-foreground">No published course sequence is available.</p>}
    <div id="published-lesson-outline" className="scroll-mt-5">
      <UnifiedLessonOutline lessons={published} selectedId={currentLessonId}
        label="Published lesson outline"
        renderAction={item=><Link to="/classes"
          search={{...search,tab:"lessons",lesson:item.id}}
          className="underline-offset-2 hover:underline">{item.title}</Link>}/>
    </div>
    {showCompletion&&published.length>0&&<div className="mt-4 border-t pt-4">
      <CourseLessonProgress completed={completedCount} total={published.length}
        ariaLabel="Self-reported lesson completion"
        description="Self-reported completion, not academic mastery or credit." />
    </div>}
  </WorkspacePanel>;
}
