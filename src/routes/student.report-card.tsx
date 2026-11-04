import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getStudentReportCard,
  getStudentTranscript,
} from "@/modules/learning/report-cards.functions";
import { ReportCardView, TranscriptView } from "@/components/report-card";
import { QueryState, WorkspaceShell } from "@/components/workspace";
import { normalizeClientError } from "@/lib/client-error";

export const Route = createFileRoute("/student/report-card")({ component: StudentReportCardPage });

type Grade = Awaited<ReturnType<typeof getStudentReportCard>>["grades"][number];
type Transcript = Awaited<ReturnType<typeof getStudentTranscript>>;

function StudentReportCardPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [transcript, setTranscript] = useState<Transcript>({ rows: [], issuances: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

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
    }).catch((cause: unknown) => {
      if (active) {
        const failure = normalizeClientError(cause, "Your report card could not be loaded. Please try again.");
        setError(failure.kind === "authentication"
          ? "Sign in with your student account to view your report card."
          : failure.kind === "authorization"
            ? "You do not have permission to view this report card."
            : failure.message);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [retryKey]);

  return <WorkspaceShell eyebrow="Report card" title="My report card"
    subtitle="Your finalized grades by grading period and your transcript record.">
      <QueryState loading={loading && "Loading report card…"} error={error}
        onRetry={() => {setError("");setLoading(true);setRetryKey(value => value + 1);}}>
        <ReportCardView grades={grades} />
        <TranscriptView rows={transcript.rows} issuances={transcript.issuances} />
      </QueryState>
  </WorkspaceShell>;
}
