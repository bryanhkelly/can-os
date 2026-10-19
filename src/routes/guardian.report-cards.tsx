import { createFileRoute } from "@tanstack/react-router";
import {resolveGuardianChild} from "@/domain/guardian-child-context";
import { useEffect, useState } from "react";
import {
  getStudentReportCard,
  getStudentTranscript,
} from "@/modules/learning/report-cards.functions";
import { getGuardianStudents } from "@/modules/learning/guardian-academic-queries.functions";
import { ReportCardView, TranscriptView } from "@/components/report-card";

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

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Report card</p>
      <h1 className="mt-2 font-serif text-4xl">Report card</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Finalized grades by grading period, plus the durable transcript record, for students connected to your account.</p>
      {students.length > 0 && <label className="mt-8 block max-w-sm text-sm font-semibold">
        Student
        <select className="mt-2 w-full rounded-lg border bg-background p-3" value={selected} onChange={event => void navigate({search:{student:event.target.value}})}>
          {students.map(student => <option key={student.studentPersonId} value={student.studentPersonId}>{student.firstName} {student.lastName}</option>)}
        </select>
      </label>}
      {(loading || loadingStudents) && <p className="mt-8 text-sm" role="status">Loading report card…</p>}
      {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
      {student&&!selected&&!loadingStudents&&!error&&<p role="alert" className="mt-8 rounded-lg border p-4 text-sm">This student is unavailable in your current family workspace. Choose an authorized student above.</p>}
      {!loading && !loadingStudents && !error && students.length === 0 && <p className="mt-8 text-sm">No students with academic-viewing permission were found at your school.</p>}
      {!loading && !loadingStudents && !error && students.length > 0 && <>
        <ReportCardView grades={grades} />
        <TranscriptView rows={transcript.rows} issuances={transcript.issuances} />
      </>}
    </div>
  </main>;
}
