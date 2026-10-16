import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getStudentReportCard,
  getStudentTranscript,
} from "@/modules/learning/report-cards.functions";
import { ReportCardView, TranscriptView } from "@/components/report-card";

export const Route = createFileRoute("/student/report-card")({ component: StudentReportCardPage });

type Grade = Awaited<ReturnType<typeof getStudentReportCard>>["grades"][number];
type Transcript = Awaited<ReturnType<typeof getStudentTranscript>>;

function StudentReportCardPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [transcript, setTranscript] = useState<Transcript>({ rows: [], issuances: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      getStudentReportCard({ data: {} }),
      getStudentTranscript({ data: {} }),
    ]).then(([reportCard, transcriptResult]) => {
      if (!active) return;
      setGrades(reportCard.grades);
      setTranscript(transcriptResult);
      setLoading(false);
    }).catch(() => {
      if (active) {
        setError("Sign in with your student account to view your report card.");
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Report card</p>
      <h1 className="mt-2 font-serif text-4xl">My report card</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Your finalized grades by grading period and your transcript record.</p>
      {loading && <p className="mt-8 text-sm" role="status">Loading report card…</p>}
      {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
      {!loading && !error && <>
        <ReportCardView grades={grades} />
        <TranscriptView rows={transcript.rows} issuances={transcript.issuances} />
      </>}
    </div>
  </main>;
}
