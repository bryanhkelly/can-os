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
};

/** Ordinary student Class list and navigation. The standard Class enrollment
 * and consent services own registration, not this read-only view.
 */
export function NativeStudentClassHome({classes,navigation}:{
  classes:StudentClass[];navigation:ReactNode;
}){
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Learning"
    title="My Classes"
    subtitle="Your current Classes and published offerings, based on your verified CAN Site membership.">
    {navigation}
    <section className="mt-6 space-y-3" aria-label="Student Classes">
      <h2 className="font-serif text-2xl">Available Classes</h2>
      {classes.length===0&&<p className="text-sm text-muted-foreground">
        There are no active Classes available for your Site.
      </p>}
      <div className="grid gap-4 md:grid-cols-2">
        {classes.map(item=>{
          const enrolled=item.status==="active"&&!!item.courseAttemptId;
          return <article key={item.classId} className="space-y-3 border border-border bg-card p-5">
            <h3 className="font-serif text-xl">{item.title}</h3>
            <p className="text-xs text-muted-foreground">
              {item.deliveryMode.replaceAll("_"," ")} · {enrolled?"Enrolled":
                item.status==="pending"?"Enrollment pending":"Not enrolled"}
            </p>
            {enrolled?<Button asChild>
              <Link to="/class/$classId" params={{classId:item.classId}}
                search={{view:"learn",tab:"lessons"}}>
                Open Class
              </Link>
            </Button>:<p className="text-sm text-muted-foreground">
              Enrollment and consent are managed through the regular Class Offering workflow.
            </p>}
          </article>;
        })}
      </div>
    </section>
  </WorkspaceShell>;
}
