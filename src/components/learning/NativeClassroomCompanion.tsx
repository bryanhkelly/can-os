import { useLearnerClassroomRooms } from "@/components/learning/useLearnerClassroomRooms";
import { Link } from "@tanstack/react-router";
import { FacilitatedLearnerPairing } from "@/components/learning/FacilitatedLearnerPairing";
import { ClassroomCompanionRoom } from "@/components/learning/ClassroomCompanionRoom";
import { ClassroomFeedbackPanel } from "@/components/learning/ClassroomFeedbackPanel";

/** The room is only an adjunct to this learner's native Course Attempt.
 * QR possession and client connection confer no attendance, progress, grade
 * or access to another Class. Every companion request rechecks enrollment. */
export function NativeClassroomCompanion({courseAttemptId}:{
  courseAttemptId:string;
}){
  const rooms=useLearnerClassroomRooms(courseAttemptId);
  return <section className="mt-5 space-y-4" aria-label="My facilitated classroom">
    <header className="border border-border bg-card p-4">
      <h2 className="font-serif text-xl font-semibold">Join your classroom</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Scan the facilitator's QR code or enter its short-lived code.
        CAN verifies your own enrollment and Course Attempt before admitting
        you to this Class Session. A connection is not attendance.
      </p>
      <Link to="/join" className="mt-3 inline-block text-sm font-semibold underline">
        Join with classroom QR or code
      </Link>
    </header>
    <FacilitatedLearnerPairing courseAttemptId={courseAttemptId}/>
    <ClassroomFeedbackPanel courseAttemptId={courseAttemptId}/>
    {rooms.isPending&&<p role="status" className="text-sm">Connecting to your current classroom…</p>}
    {rooms.isFetching&&!rooms.isPending&&<p role="status" className="text-xs text-muted-foreground">Rechecking current classroom access…</p>}
    {rooms.isError&&<p role="alert" className="text-sm">
      Room activities are unavailable. Confirm your current Class Enrollment.
    </p>}
    {rooms.isSuccess&&rooms.data.rooms.map(room=>
      <ClassroomCompanionRoom key={room.facilitatedSessionId}
        courseAttemptId={courseAttemptId}
        facilitatedSessionId={room.facilitatedSessionId}/>
    )}
    {rooms.isSuccess&&rooms.data.rooms.length===0&&
      <p role="status" className="text-sm text-muted-foreground">
        After you pair with an active Class Session, your facilitator's
        questions and your own answer form will appear here.
      </p>}
  </section>;
}
