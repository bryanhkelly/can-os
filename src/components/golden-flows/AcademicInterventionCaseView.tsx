import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageSquareText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AcademicInterventionCase } from "@/modules/learning/missing-work-query";

export function AcademicInterventionCaseView({
  data,
}: {
  data: AcademicInterventionCase;
}) {
  const isResolved = data.action?.status === "resolved";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{data.section.code}</Badge>
            <Badge variant={data.submission.timeliness === "late" ? "secondary" : "destructive"}>
              {formatToken(data.submission.timeliness)}
            </Badge>
            <Badge variant="outline">{formatToken(data.submission.status)}</Badge>
          </div>
          <h1 className="mt-4 font-serif text-4xl tracking-tight">
            {data.student.displayName}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.assessment.title} · {data.section.title}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-2xl font-normal">
              Academic context
            </CardTitle>
            <CardDescription>
              One record shared across student, family, teacher, and support workspaces.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Metric label="Due" value={formatDate(data.assessment.dueAt)} />
            <Metric
              label="Submitted"
              value={formatDate(data.submission.submittedAt)}
            />
            <Metric
              label="Score"
              value={
                data.submission.score
                  ? `${data.submission.score}${data.assessment.pointsPossible ? ` / ${data.assessment.pointsPossible}` : ""}`
                  : "Not graded"
              }
            />
          </CardContent>
        </Card>

        {data.communication ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-2xl font-normal">
                <MessageSquareText className="size-5" />
                Family + teacher thread
              </CardTitle>
              <CardDescription>
                Conversation stays attached to this submission instead of becoming disconnected email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.communication.messages.map((message) => (
                <div key={message.id} className="border-l-2 border-border pl-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium">{message.senderName}</p>
                    <time className="text-[11px] text-muted-foreground">
                      {formatDateTime(message.sentAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {message.body}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <aside className="space-y-5">
        {data.insight ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="size-4" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Insight
                </span>
              </div>
              <CardTitle className="font-serif text-xl font-normal">
                {data.insight.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                {data.insight.summary}
              </p>
              {data.insight.uncertainty ? (
                <p className="mt-4 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
                  {data.insight.uncertainty}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {data.action ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {isResolved ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <Clock3 className="size-4 text-muted-foreground" />
                )}
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Action · {formatToken(data.action.status)}
                </span>
              </div>
              <CardTitle className="font-serif text-xl font-normal">
                {data.action.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.action.description ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {data.action.description}
                </p>
              ) : null}
              {data.action.dueAt ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Due {formatDate(data.action.dueAt)}
                </p>
              ) : null}
              {data.action.resolutionNote ? (
                <div className="mt-4 rounded-lg bg-accent/50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Resolution
                  </p>
                  <p className="mt-1 text-sm">{data.action.resolutionNote}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-accent/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function formatToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
