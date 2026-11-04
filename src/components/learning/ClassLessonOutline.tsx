import { Link } from "@tanstack/react-router";
import { Check, Play } from "lucide-react";
import { WorkspacePanel } from "@/components/workspace";
import type { ClassContent } from "@/domain/class-content";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";

export function ClassLessonOutline({ content, search, currentLessonId, completed, showCompletion }: {
  content: ClassContent | null; search: { section: string; student?: string };
  currentLessonId?: string; completed: ReadonlySet<string>; showCompletion: boolean;
}) {
  const lessons = content?.modules.flatMap(module => module.lessons).filter(isLearnerFacingInstruction) ?? [];
  const completedCount = lessons.filter(lesson => completed.has(lesson.id)).length;
  const percent = lessons.length ? Math.round(completedCount / lessons.length * 100) : 0;
  return <WorkspacePanel title="Lesson outline" className="classroom-outline-panel"
    actions={lessons.length > 0 ? <span className="text-xs text-muted-foreground">{showCompletion ? `${completedCount} / ${lessons.length}` : `${lessons.length} lessons`}</span> : undefined}>
    {!content && <p className="text-sm text-muted-foreground">No published course sequence is available.</p>}
    <nav id="published-lesson-outline" aria-label="Published lesson outline" className="classroom-outline scroll-mt-5">
      {content?.modules.filter(module => module.lessons.some(isLearnerFacingInstruction)).map(module => <section key={module.id}>
        <h3 className="mb-2 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">{module.title}</h3>
        <ol className="space-y-1">{module.lessons.filter(isLearnerFacingInstruction).map(lesson => {
          const current = currentLessonId === lesson.id;
          const done = showCompletion && completed.has(lesson.id);
          const number = lessons.findIndex(item => item.id === lesson.id) + 1;
          return <li key={lesson.id}><Link to="/classes" search={{ ...search, tab: "lessons", lesson: lesson.id }}
            aria-current={current ? "page" : undefined} className={`flex items-start gap-3 border-b border-l-2 p-3 text-sm hover:bg-muted ${current ? "border-l-primary bg-primary/5" : "border-l-transparent"}`}>
            <span className={`grid size-7 shrink-0 place-items-center border text-xs ${current ? "bg-primary/10 text-primary" : done ? "text-success" : "bg-muted text-muted-foreground"}`}>
              {current ? <Play aria-hidden="true" className="size-3"/> : done ? <Check aria-hidden="true" className="size-3"/> : number}
            </span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{number}. {lesson.title}</span>
              <span className="text-[0.65rem] text-muted-foreground">{lesson.estimatedMinutes ? `${lesson.estimatedMinutes} min` : "Published lesson"}</span></span>
            <span className={`mt-1 text-[0.6rem] ${done ? "text-success" : "text-muted-foreground"}`}>{current ? "Current" : done ? "Complete" : "Upcoming"}</span>
          </Link></li>;
        })}</ol>
      </section>)}
    </nav>
    {showCompletion && lessons.length > 0 && <div className="mt-4 border-t pt-4">
      <p className="text-xs font-semibold">Course progress</p>
      <div role="progressbar" aria-label="Self-reported lesson completion" aria-valuemin={0} aria-valuemax={lessons.length}
        aria-valuenow={completedCount} aria-valuetext={`${completedCount} of ${lessons.length} lessons self-reported complete`}
        className="mt-2 h-1.5 bg-muted"><div className="h-full bg-primary" style={{width:`${percent}%`}}/></div>
      <div className="mt-2 flex justify-between gap-2 text-[0.65rem] text-muted-foreground"><span>{completedCount} of {lessons.length} lessons</span><span>{percent}% complete</span></div>
      <p className="mt-2 text-[0.6rem] text-muted-foreground">Self-reported completion, not academic mastery or credit.</p>
    </div>}
  </WorkspacePanel>;
}
