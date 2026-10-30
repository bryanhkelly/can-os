import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getStudentReportCard,
  getStudentTranscript,
} from "@/modules/learning/report-cards.functions";
import { ReportCardView, TranscriptView } from "@/components/report-card";
import { QueryState, WorkspaceShell } from "@/components/workspace";

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

  return <WorkspaceShell eyebrow="CAN OS · Report card" title="My report card"
    subtitle="Your finalized grades by grading period and your transcript record.">
      <QueryState loading={loading && "Loading report card…"} error={error}>
        <ReportCardView grades={grades} />
        <TranscriptView rows={transcript.rows} issuances={transcript.issuances} />
      </QueryState>
  </WorkspaceShell>;
}
