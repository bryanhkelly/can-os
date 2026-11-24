import { Link } from "@tanstack/react-router";
import { WorkspacePanel, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { NativeStudentHomeworkIndex as Index } from "@/modules/classes/native-student-homework-index";

export function NativeStudentHomeworkIndex({data,compact=false}:{data:Index;compact?:boolean}){
  if(data.kind!=="student"||!data.classes.length)return null;
  return <WorkspacePanel title="Class assignments" description="Homework and feedback from your current native Class enrollments." className="mt-5">
    <div className="space-y-4">{data.classes.map(item=><section key={item.classId} className="border-b border-border pb-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{item.title}</h3>
        <Link to="/class/$classId" params={{classId:item.classId}} search={{view:"learn",tab:"assignments"}} className="text-sm font-semibold underline">Open assignments</Link>
      </div>
      {!item.available?<WorkspaceNotice tone="attention" className="mt-2">Assignments could not be verified for this Class.</WorkspaceNotice>:
        <><p className="mt-2 text-xs text-muted-foreground">{item.assignments.length} assignments · {item.assignments.filter(a=>a.status==="submitted").length} awaiting feedback
          {item.creditMode==="not_applicable"?" · Noncredit":""}</p>
        {!compact&&<ul className="mt-3 space-y-2">{item.assignments.map(assignment=><li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{assignment.title}</span><StatusBadge tone={assignment.status==="returned"?"attention":"neutral"}>{assignment.status.replaceAll("_"," ")}</StatusBadge>
        </li>)}</ul>}</>}
    </section>)}</div>
  </WorkspacePanel>;
}
