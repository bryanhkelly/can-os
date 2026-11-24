import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";

export type StudentClass={
  classId:string;
  title:string;
  deliveryMode:string;
  enrollmentId:string|null;
  status:string;
  courseAttemptId:string|null;
  canJoin:boolean;
  creditMode?:string|null;
};

/** Ordinary student Class list and navigation. The standard Class enrollment
 * and consent services own registration, not this read-only view.
 */
export function NativeStudentClassHome({classes,navigation}:{
  classes:StudentClass[];navigation:ReactNode;
}){
  const enrolled=classes.filter(item=>item.status==="active"&&!!item.courseAttemptId);
  const enrolledIds=new Set(enrolled.map(item=>item.classId));
  const groups=[{title:"Enrolled Classes",items:enrolled},{title:"Other available Classes",items:classes.filter(item=>!enrolledIds.has(item.classId))}];
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Learning"
    title="My Classes"
    subtitle="Your current Classes and published offerings, based on your verified CAN Site membership.">
    {navigation}
    {groups.map(group=><section key={group.title} className="mt-6 space-y-3" aria-label={group.title}>
      <h2 className="font-serif text-2xl">{group.title}</h2>
      {group.items.length===0&&<p className="text-sm text-muted-foreground">
        {group.title==="Enrolled Classes"?"No active Class enrollments are available.":"No other Classes are available for your Site."}
      </p>}
      <div className="grid gap-4 md:grid-cols-2">
        {group.items.map(item=>{
          const enrolled=item.status==="active"&&!!item.courseAttemptId;
          return <article key={item.classId} className="space-y-3 border border-border bg-card p-5">
            <h3 className="font-serif text-xl">{item.title}</h3>
            <p className="text-xs text-muted-foreground">
              {item.deliveryMode.replaceAll("_"," ")} · {enrolled?"Enrolled":
                item.status==="pending"?"Enrollment pending":"Not enrolled"}
            </p>
            {enrolled&&item.creditMode==="not_applicable"&&<p className="text-xs text-muted-foreground">Noncredit participation. No academic credit is awarded.</p>}
            {enrolled?<div className="flex flex-wrap gap-2"><Button asChild>
              <Link to="/class/$classId" params={{classId:item.classId}}
                search={{view:"learn",tab:"lessons"}}>
                Open Class
              </Link>
            </Button><Button asChild variant="outline"><Link to="/class/$classId" params={{classId:item.classId}} search={{view:"learn",tab:"assignments"}}>Assignments</Link></Button><Button asChild variant="outline"><Link to="/class/$classId" params={{classId:item.classId}} search={{view:"learn",tab:"progress"}}>Progress</Link></Button></div>:<div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {item.status==="pending"
                  ?"Your Class enrollment is awaiting authorization."
                  :item.canJoin
                    ?"Ask your verified guardian to request this Class through Classes for my family. Your registrar can also help."
                    :"This Class is not currently accepting learner enrollment."}
              </p>
              <Link to="/student/my-school" search={{tab:undefined}}
                className="text-sm font-semibold text-primary underline underline-offset-4">
                View my school and contacts
              </Link>
              <p className="text-xs text-muted-foreground">
                Guardian requests, approval and consent use the normal Class enrollment workflow.
              </p>
            </div>}
          </article>;
        })}
      </div>
    </section>)}
  </WorkspaceShell>;
}
