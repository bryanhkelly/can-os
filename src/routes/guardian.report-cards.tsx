import { createFileRoute } from "@tanstack/react-router";
import {resolveGuardianChild} from "@/domain/guardian-child-context";
import { useEffect, useState } from "react";
import {
  getStudentReportCard,
  getStudentTranscript,
} from "@/modules/learning/report-cards.functions";
import { getGuardianStudents } from "@/modules/learning/guardian-academic-queries.functions";
import { ReportCardView, TranscriptView } from "@/components/report-card";
import { EmptyState, QueryState, WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/guardian/report-cards")({
  validateSearch:(search:Record<string,unknown>):{student?:string}=>({
    student:typeof search.student==="string"?search.student:undefined,
  }),
  component:()=> <GuardianReportCardsPage key={Route.useSearch().student??"default"}/>,
});

type Student = { studentPersonId: string; firstName: string; lastName: string };
type Grade = Awaited<ReturnType<typeof getStudentReportCard>>["grades"][number];
type Transcript = Awaited<ReturnType<typeof getStudentTranscript>>;

function GuardianReportCardsPage() {
  const {student}=Route.useSearch();
  const navigate=Route.useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState("");
  const [grades, setGrades] = useState<Grade[]>([]);
  const [transcript, setTranscript] = useState<Transcript>({ rows: [], issuances: [] });
  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getGuardianStudents().then(result => {
      if (!active) return;
      setStudents(result.students);
      const requested = student??null;
   setSelected(resolveGuardianChild(result.students,requested));
      setLoadingStudents(false);
    }).catch(() => {
      if (active) {
        setError("Sign in with an authorized guardian account to view report cards.");
        setLoadingStudents(false);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) { setGrades([]); setTranscript({ rows: [], issuances: [] }); setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      getStudentReportCard({ data: { studentPersonId: selected } }),
      getStudentTranscript({ data: { studentPersonId: selected } }),
    ]).then(([reportCard, transcriptResult]) => {
      if (!active) return;
      setGrades(reportCard.grades);
      setTranscript(transcriptResult);
      setLoading(false);
    }).catch(() => {
      if (active) {
        setGrades([]);
        setTranscript({ rows: [], issuances: [] });
        setError("Unable to load the report card for this student.");
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [selected]);

  const unavailable = student && !selected && !loadingStudents
    ? "This student is unavailable in your current family workspace. Choose an authorized student above."
    : "";

  return <WorkspaceShell eyebrow="CAN OS · Report card" title="Report card"
    subtitle="Finalized grades by grading period, plus the durable transcript record, for students connected to your account.">
      {students.length > 0 && <label className="mt-8 block max-w-sm text-sm font-semibold">
        Student
        <select className="mt-2 w-full rounded-lg border bg-background p-3" value={selected} onChange={event => void navigate({search:{student:event.target.value}})}>
          {students.map(student => <option key={student.studentPersonId} value={student.studentPersonId}>{student.firstName} {student.lastName}</option>)}
        </select>
      </label>}
      <QueryState loading={(loading || loadingStudents) && "Loading report card…"}
        error={error || unavailable} isEmpty={students.length === 0}
        empty={<EmptyState className="mt-8" title="No students with academic-viewing permission were found at your school." />}>
        <ReportCardView grades={grades} />
        <TranscriptView rows={transcript.rows} issuances={transcript.issuances} />
      </QueryState>
  </WorkspaceShell>;
}
