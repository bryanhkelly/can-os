import { Link } from "@tanstack/react-router";
import type { getClassWorkspace } from "@/modules/learning/class-workspace.functions";

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
type Thread = NonNullable<Workspace["discussions"]>[number];

/** Lesson discussion navigation. The route supplies only approved threads
 * and does not expose these links in a guardian-only learning view.
 */
export function ClassLessonDiscussions({
  threads, role, sectionId, lessonId,
}: {
  threads: readonly Thread[];
  role: Workspace["role"];
  sectionId: string;
  lessonId: string;
}) {
  return <section className="space-y-4" aria-label="Lesson discussions">
            <p className="text-sm text-muted-foreground">Discuss this lesson with your class. Posts use the school’s shared discussion threads and teacher moderation.</p>
            {!threads.length && <p role="status" className="text-sm">No discussion has been opened for this lesson.</p>}
            <ul className="divide-y">{threads.map(thread => <li key={thread.id} className="py-3">
              <Link to={role === "teacher" ? "/teacher/discussions" : "/student/discussions"} search={{ section: sectionId, thread: thread.id }}
                className="font-semibold underline">{thread.title}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{thread.locked ? "Locked · read only" : "Open for class responses"}{thread.lessonId === null ? " · Class-wide discussion" : ""}</p>
            </li>)}
          </ul>
            {role === "teacher" && <Link to="/teacher/discussions" search={{ section: sectionId, lesson: lessonId }} className="text-sm underline">Start a discussion from this lesson</Link>}
          </section>;
}
