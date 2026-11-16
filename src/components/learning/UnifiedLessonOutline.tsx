import { Check, Play } from "lucide-react";
import type { ReactNode } from "react";

export type UnifiedLessonItem = {
  id: string;
  title: string;
  group?: string | null;
  detail?: string | null;
  status?: "not_started" | "in_progress" | "completed" | "waived" | null;
};

/** Shared lesson navigation for academic, recorded and native Class players.
 * The caller owns authorization and lesson-selection actions; this component
 * never grants access, makes completion decisions or changes official grades. */
export function UnifiedLessonOutline({lessons,selectedId,renderAction,label="Course lessons"}:{
  lessons:readonly UnifiedLessonItem[];
  selectedId?:string|null;
  renderAction:(lesson:UnifiedLessonItem)=>ReactNode;
  label?:string;
}){
  let currentGroup:string|null|undefined=undefined;
  return <nav aria-label={label} className="classroom-outline">
    <ol className="space-y-1">
      {lessons.map((lesson,index)=>{
        const group=lesson.group??null;
        const showGroup=group!==currentGroup;
        currentGroup=group;
        const selected=selectedId===lesson.id;
        const done=lesson.status==="completed"||lesson.status==="waived";
        return <li key={lesson.id}>
          {showGroup&&group&&<h3 className="mb-2 mt-4 text-3xs font-bold uppercase tracking-wider text-muted-foreground">
            {group}
          </h3>}
          <div aria-current={selected?"step":undefined}
            className={"flex items-start gap-3 border-b border-l-2 p-3 text-sm " +
              (selected?"border-l-primary bg-primary/5":"border-l-transparent hover:bg-muted/40")}>
            <span className={"grid size-7 shrink-0 place-items-center border text-xs " +
              (selected?"bg-primary/10 text-primary":done?"text-success":"bg-muted text-muted-foreground")}>
              {selected?<Play aria-hidden="true" className="size-3"/>:
                done?<Check aria-hidden="true" className="size-3"/>:index+1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">{renderAction(lesson)}</div>
              <span className="text-3xs text-muted-foreground">
                {lesson.detail??"Published lesson"}
              </span>
            </div>
            <span className={"mt-1 text-3xs "+(done?"text-success":"text-muted-foreground")}>
              {selected?"Current":lesson.status==="waived"?"Waived":done?"Complete":"Upcoming"}
            </span>
          </div>
        </li>;
      })}
    </ol>
  </nav>;
}
