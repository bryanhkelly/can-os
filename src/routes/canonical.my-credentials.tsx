import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { WorkspaceShell, QueryState } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { downloadBase64 } from "@/lib/download";
import { normalizeClientError } from "@/lib/client-error";
import {
  listMyNoncreditCredentials, downloadMyNoncreditCredential,
} from "@/modules/learning/learner-credentials.functions";

export const Route = createFileRoute("/canonical/my-credentials")({
  component: MyNoncreditCredentials,
});

function MyNoncreditCredentials() {
  const query = useQuery({
    queryKey: ["my-canonical-noncredit-credentials"],
    queryFn: () => listMyNoncreditCredentials(),
    retry: false, gcTime: 0,
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const awards = query.data ?? [];

  async function download(issuanceId: string, format: "pdf" | "badge_svg" | "badge_json") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const file = await downloadMyNoncreditCredential({ data: { issuanceId, format } });
      downloadBase64(file.base64, file.filename, file.mediaType);
    } catch (cause) {
      setError(normalizeClientError(cause, "Unable to download this award.").message);
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <WorkspaceShell eyebrow="Learning records" title="My achievements"
    subtitle="Noncredit completion certificates and digital badges issued by your training provider. These are not academic credits or professional certifications.">
    {error && <p role="alert" className="mt-5 border border-destructive p-4 text-sm text-destructive">{error}</p>}
    <div className="mt-6">
      <QueryState loading={query.isPending ? "Loading your achievements..." : undefined}
        error={query.isError ? normalizeClientError(query.error,
          "Your achievements are unavailable.").message : undefined}
        onRetry={() => void query.refetch()} retrying={query.isFetching}
        isEmpty={awards.length === 0}
        empty={<p className="border border-border bg-card p-5 text-sm text-muted-foreground">No issued achievements are available for this account.</p>}>
        <div className="grid gap-4">
          {awards.map(award => <article key={award.id} className="border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{award.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {award.kind === "digital_badge" ? "Digital badge" : "Certificate of completion"}
                  {" · Issued "}{new Date(award.issuedAt).toLocaleDateString()}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{award.credentialReference}</p>
              </div>
              <span className={"border px-2 py-1 text-xs font-medium " +
                (award.current ? "border-success text-foreground" : "border-destructive text-destructive")}>
                {award.current ? "Current" : "No longer valid"}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {award.kind === "completion_certificate" ?
                <Button size="sm" disabled={!award.current || busy}
                  onClick={() => void download(award.id, "pdf")}>Download certificate</Button> :
                <>
                  <Button size="sm" disabled={!award.current || busy}
                    onClick={() => void download(award.id, "badge_svg")}>Download badge</Button>
                  <Button variant="outline" size="sm" disabled={!award.current || busy}
                    onClick={() => void download(award.id, "badge_json")}>Badge details</Button>
                </>}
            </div>
          </article>)}
        </div>
      </QueryState>
    </div>
  </WorkspaceShell>;
}
