import { Link } from "@tanstack/react-router";
import { BookOpen, Clock3, FileText } from "lucide-react";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { DashboardProgress } from "@/components/workspace/dashboard-widgets";
import { StudentAssignmentLink } from "./StudentAssignmentLink";
import type { StudentSuccessStep } from "@/domain/student-success";
import type { LearningResume } from "./student-dashboard-data";

/** Reusable lesson resumption, preserving the difference between
 * self-reported progress, teacher-reviewed work, and earned credit.
 */
export function StudentContinueLearningPanel({
  resume, unavailable, nextWork, hasClasses, classes = [],
}: {
  resume: LearningResume | null;
  unavailable: boolean;
  nextWork?: StudentSuccessStep;
  hasClasses: boolean;
  classes?: { classId: string; title: string; status: string; courseAttemptId: string | null }[];
}) {
  const textLink = "student-dashboard-link";
  const enrolledClasses = classes.filter(item =>
    item.status === "active" && !!item.courseAttemptId);
  // Legacy Section progress has no authoritative Class ID. Never infer one
  // from a title: two Classes may share a name or one may be renamed.
  // With exactly one active enrollment the destination is unambiguous;
  // otherwise each authorized Class is linked explicitly below.
  const resumeClassId = enrolledClasses.length === 1
    ? enrolledClasses[0]?.classId ?? null : null;
  return <DashboardPanel id="continue-learning" title="Continue Learning"
          action={resume && resumeClassId?<Link to="/class/$classId" params={{classId:resumeClassId}} search={{view:"learn",tab:"lessons"}} className={textLink}>Open Class →</Link>:
            <Link to="/class" className={textLink}>View my classes →</Link>}>
          {resume ? <div className="student-resume-grid">
            <div>
              <div className="flex items-start gap-3">
                <div className="student-course-art" aria-hidden="true"><BookOpen className="size-8" /></div>
                <div className="min-w-0 flex-1"><h3 className="font-serif text-section leading-tight">{resume.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{resume.lesson?.title ?? "Published lessons reviewed"}</p>
                  {resume.total > 0 ? <DashboardProgress label="Self-reported lesson completion" value={resume.completed}
                    max={resume.total} className="mt-4" /> : <p className="mt-3 text-xs text-muted-foreground">No published instructional lessons available.</p>}
                </div>
              </div>
              {resumeClassId ? <Link to="/class/$classId" params={{classId:resumeClassId}}
                search={{view:"learn",tab:"lessons"}} className="student-resume-action">
                Open {resume.title} <span aria-hidden="true">→</span></Link>
                : <Link to="/class" className="student-resume-action">Choose Class →</Link>}
              <p className="mt-2 text-3xs text-muted-foreground">Self-reported completion is not mastery or earned credit.</p>
            </div>
            <div className="student-up-next">
              <p className="text-3xs font-semibold uppercase tracking-widest">Next up</p>
              <div className="mt-3 flex gap-2"><FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-xs">{resume.lesson?.title ?? "Check your classwork and feedback"}</p></div>
              {resume.lesson?.estimatedMinutes && <div className="mt-3 flex gap-2"><Clock3 aria-hidden="true" className="size-4 shrink-0" />
                <p className="text-xs">About {resume.lesson.estimatedMinutes} min · estimated duration</p></div>}
              {resumeClassId ? <Link to="/class/$classId" params={{classId:resumeClassId}}
                search={{view:"learn",tab:"lessons"}}
                className="mt-4 block border bg-accent p-2 text-center text-xs font-semibold text-accent-foreground">
                Open Class →</Link> : <Link to="/class"
                className="mt-4 block border bg-accent p-2 text-center text-xs font-semibold text-accent-foreground">
                Choose Class →</Link>}
              {nextWork && <div className="mt-4 space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold">Assignment needing attention</p>
                <p className="text-xs text-muted-foreground">{nextWork.title}</p>
                <StudentAssignmentLink assessmentId={nextWork.assessmentId} sectionId={nextWork.sectionId}
                  className="student-resume-action">Continue assignment →</StudentAssignmentLink>
              </div>}
            </div>
            {enrolledClasses.length > 0 && <nav aria-label="Your enrolled Classes" className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold">Your Classes</p>
              <div className="flex flex-wrap gap-2">{enrolledClasses.map(item =>
                <Link key={item.classId} to="/class/$classId" params={{classId:item.classId}}
                  search={{view:"learn",tab:"lessons"}} className="student-resume-action">
                  {item.title} →</Link>)}</div>
            </nav>}
          </div> : <div className="space-y-3">
            <p role="status" className="text-xs text-muted-foreground">{unavailable
              ? "Your lesson progress could not be loaded. Open your class to retry."
              : hasClasses ? "Open a class to review its published lessons and next steps." : "No enrolled classes are available yet."}</p>
            {nextWork && <><p className="text-sm font-semibold">{nextWork.title}</p>
              <StudentAssignmentLink assessmentId={nextWork.assessmentId} sectionId={nextWork.sectionId}
                className="student-resume-action">Continue assignment →</StudentAssignmentLink></>}
            <Link to="/class" className={textLink}>View my classes →</Link>
          </div>}
        </DashboardPanel>;
}
