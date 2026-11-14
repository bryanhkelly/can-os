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

function studentRecordError(cause: unknown, fallback: string) {
  const failure = normalizeClientError(cause, fallback);
  return failure.kind === "authentication"
    ? "Sign in with your student account to view your academic records."
    : failure.kind === "authorization"
      ? "You do not have permission to view these academic records."
      : failure.message;
}

function StudentReportCardPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [transcript, setTranscript] = useState<Transcript>({ rows: [], issuances: [] });
  const [loading, setLoading] = useState(true);
  const [gradesError, setGradesError] = useState("");
  const [transcriptError, setTranscriptError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    // A transcript outage must not hide released grades, and vice versa.
    Promise.allSettled([
      getStudentReportCard({ data: {} }),
      getStudentTranscript({ data: {} }),
    ]).then(([reportCard, transcriptResult]) => {
      if (!active) return;
      if (reportCard.status === "fulfilled") {
        setGrades(reportCard.value.grades);
        setGradesError("");
      } else {
        setGradesError(studentRecordError(reportCard.reason, "Your report card could not be loaded. Please try again."));
      }
      if (transcriptResult.status === "fulfilled") {
        setTranscript(transcriptResult.value);
        setTranscriptError("");
      } else {
        setTranscriptError(studentRecordError(transcriptResult.reason, "Your transcript could not be loaded. Please try again."));
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [retryKey]);

  function retry() {
    setGradesError("");
    setTranscriptError("");
    setLoading(true);
    setRetryKey(value => value + 1);
  }

  return <WorkspaceShell eyebrow="Report card" title="My report card"
    subtitle="Your finalized grades by grading period and your transcript record.">
      <QueryState loading={loading && "Loading report card…"} error={gradesError} onRetry={retry}>
        <ReportCardView grades={grades} />
      </QueryState>
      <QueryState loading={loading && "Loading transcript…"} error={transcriptError} onRetry={retry}>
        <TranscriptView rows={transcript.rows} issuances={transcript.issuances} />
      </QueryState>
  </WorkspaceShell>;
}
