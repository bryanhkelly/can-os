import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { enrollInValorDemoClass } from "@/modules/classes/native-valor-demo-student.functions";
import { normalizeClientError } from "@/lib/client-error";

export type ValorStudentClass = {
  classId:string;
  title:string;
  deliveryMode:string;
  enrollmentId:string|null;
  status:string;
  courseAttemptId:string|null;
  canJoin:boolean;
};

/** Scoped CAN student experience. Reuses /class/:classId and its canonical
 * Course Attempt; no parallel classroom or youth-admission database. */
export function ValorStudentClassHome({classes,navigation}:{
  classes:ValorStudentClass[];
  navigation:ReactNode;
}) {
  const client=useQueryClient();
  const [acknowledged,setAcknowledged]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function enroll(classId:string){
    if(busy||!acknowledged[classId])return;
    setBusy(classId);setError("");setNotice("");
    try {
      const result=await enrollInValorDemoClass({data:{classId,consentAccepted:true}});
      setNotice(result.alreadyEnrolled
        ?"You're already enrolled in this Class."
        :"Enrollment saved. Open the Class to begin lessons and homework.");
      await client.invalidateQueries({queryKey:["native-valor-student-classes"]});
    }catch(failure){
      setError(normalizeClientError(failure,
        "Unable to enroll in this demo Class.").message);
    }finally{setBusy(null);}
  }
  return <WorkspaceShell width="wide" eyebrow="Valor School · Synthetic Test"
    title="My Classes"
    subtitle="Explore, enroll, study and submit homework in the canonical CAN OS classroom. This is a noncredit synthetic test school.">
    {navigation}
    <section className="mt-6 space-y-3" aria-label="Valor student Classes">
      <h2 className="font-serif text-2xl">Your available Classes</h2>
      <p className="text-sm text-muted-foreground">
        Enrollment and homework belong to your single verified student account.
        Synthetic participation does not grant academic credit or establish actual school authorization.
      </p>
      {notice&&<p role="status" className="border border-border bg-card p-4 text-sm">{notice}</p>}
      {error&&<p role="alert" className="border border-border p-4 text-sm text-destructive">{error}</p>}
      {classes.length===0&&<p>No authorized demo Classes are currently available.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {classes.map(item=>{
          const enrolled=item.status==="active"&&!!item.courseAttemptId;
          const pending=item.status==="pending";
          return <article key={item.classId} className="space-y-3 border border-border bg-card p-5">
            <div>
              <h3 className="font-serif text-xl">{item.title}</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                {item.deliveryMode.replaceAll("_"," ")} · {enrolled?"Enrolled":
                  pending?"Ready to activate":"Available to enroll"}
              </p>
            </div>
            {enrolled?<Button asChild>
              <Link to="/class/$classId" params={{classId:item.classId}}
                search={{view:"learn",tab:"lessons"}}>
                Open Class
              </Link>
            </Button>:item.canJoin?<>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={!!acknowledged[item.classId]}
                  onChange={event=>setAcknowledged(old=>({
                    ...old,[item.classId]:event.target.checked
                  }))}/>
                <span>I understand this is synthetic, noncredit test participation.</span>
              </label>
              <Button disabled={!acknowledged[item.classId]||!!busy}
                onClick={()=>void enroll(item.classId)}>
                {busy===item.classId?"Enrolling…":pending?"Start this Class":"Enroll in Class"}
              </Button>
            </>:<p className="text-sm text-muted-foreground">
              Student enrollment has not been released for this Class.
            </p>}
          </article>;
        })}
      </div>
    </section>
  </WorkspaceShell>;
}
