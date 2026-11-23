import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  ActionFooter, WorkspaceNotice, WorkspacePanel,
} from "@/components/workspace";
import { getSiteMarketingReleaseOutput } from "@/modules/programs/site-marketing-artifacts.functions";
import {
  listSiteMarketingEmailCampaigns, queueSiteMarketingEmailCampaign,
} from "@/modules/programs/site-marketing-email.functions";

type History = Awaited<ReturnType<typeof listSiteMarketingEmailCampaigns>>;
type Props = {
  siteId: string;
  packageId: string;
  releaseId: string | null;
  emailOutputId: string | null;
  releaseNumber: number | null;
  emailSubject: string | null;
  onCreateMaterials: () => void;
  canCreateMaterials: boolean;
};

/** Sending is the natural next action after preparing materials.
 * Never confuses audience categories with a contact list or provider acceptance
 * with confirmed delivery.
 */
export function MarketingEmailCampaignV61({
  siteId,packageId,releaseId,emailOutputId,releaseNumber,emailSubject,
  onCreateMaterials,canCreateMaterials,
}:Props) {
  const [recipients,setRecipients] = useState("");
  const [postalAddress,setPostalAddress] = useState("");
  const [consent,setConsent] = useState(false);
  const [requestId,setRequestId] = useState(() => crypto.randomUUID());
  const [history,setHistory] = useState<History>([]);
  const [preview,setPreview] = useState("");
  const [loading,setLoading] = useState(true);
  const [working,setWorking] = useState(false);
  const [notice,setNotice] = useState("");
  const [error,setError] = useState("");
  const [refresh,setRefresh] = useState(0);
  const count = recipients.split(/\r?\n/).filter(item => item.trim()).length;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void listSiteMarketingEmailCampaigns({data:{siteId,packageId}})
      .then(rows => {if(mounted){setHistory(rows);setError("");}})
      .catch(cause => {if(mounted)setError(cause instanceof Error ? cause.message : "Could not read send history.");})
      .finally(() => {if(mounted)setLoading(false);});
    return () => {mounted=false;};
  },[siteId,packageId,refresh]);

  useEffect(() => {
    let mounted = true;
    setPreview("");
    if (!emailOutputId) return;
    void getSiteMarketingReleaseOutput({data:{siteId,releaseId:emailOutputId}})
      .then(output => {if(mounted && output.mimeType === "text/html")setPreview(output.content);})
      .catch(() => {if(mounted)setPreview("");});
    return () => {mounted=false;};
  },[siteId,emailOutputId]);

  async function send(mode:"test"|"campaign") {
    if (working || !releaseId) return;
    if (mode === "campaign" && !window.confirm(
      "Queue this reviewed email to " + count +
      " consenting adult addresses? This sends real email. The provider may process it after you leave this page.")) return;
    setWorking(true);setError("");setNotice("");
    try {
      const result = await queueSiteMarketingEmailCampaign({data:{
        siteId,packageId,releaseId,requestId,mode,recipients,postalAddress,
        consentConfirmed:mode === "test" || consent,
      }});
      // A retry retains the same key until the server confirms a receipt.
      setRequestId(crypto.randomUUID());
      setNotice(result.created
        ? mode === "test"
          ? "A test email was queued to your verified account. Check the status below."
          : result.summary.queued + " consenting recipient emails were queued. " +
            result.summary.suppressed + " unsubscribed recipients were excluded."
        : "This send was already queued. No duplicate was created.");
      setRefresh(number => number+1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to queue email.");
    } finally {
      setWorking(false);
    }
  }

  return <WorkspacePanel title="Send Email"
    description="Send a generated, reviewed email to adults who have opted in. Sending is separate from creating materials.">
    {!releaseId ? <div className="mt-4 space-y-3">
      <WorkspaceNotice tone="attention">
        No completed email material is available. Create the email first, then return here to send it.
      </WorkspaceNotice>
      <Button type="button" disabled={!canCreateMaterials}
        onClick={onCreateMaterials}>Create Email Materials</Button>
      {!canCreateMaterials && <p className="text-xs text-muted-foreground">
        Open Outreach Details to select Email and complete the material requirements.
      </p>}
    </div> : <div className="mt-4 space-y-5">
      <div className="space-y-2">
        <Field label="To · Recipient email addresses (one per line)" required>
          <Textarea rows={4} maxLength={8000} value={recipients}
            placeholder={"person@example.org\nanother@example.org"}
            onChange={event => setRecipients(event.target.value)}/>
        </Field>
        <p className="text-xs text-muted-foreground">
          {count} {count===1?"address":"addresses"} entered · Up to 25 per campaign.
          Use only real email addresses belonging to adults who opted in.
          Audience selections do not grant contact permission.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Email subject</p>
        <div className="border border-border bg-muted/20 px-3 py-3 text-sm font-medium">
          {emailSubject?.trim() || "Subject unavailable. Return to Outreach Details to review."}
        </div>
        <p className="text-xs text-muted-foreground">
          From Email Materials v{releaseNumber}. Edit the outreach plan and generate
          updated materials to change this subject or message.
        </p>
      </div>

      <details className="border border-border/70 bg-muted/20">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Preview branded email
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (expand to review the full message)
          </span>
        </summary>
        <div className="space-y-2 border-t border-border/70 p-3">
          {preview ? <iframe title="Generated email preview" sandbox=""
            className="h-64 w-full border bg-white" srcDoc={preview}/>
            : <WorkspaceNotice tone="attention">
              The generated email preview is unavailable. Open Outreach Details
              to review the email before sending.
            </WorkspaceNotice>}
        </div>
      </details>

      <div className="space-y-4">
        <Field label="Sender's physical mailing address (included in every email)" required>
          <Textarea rows={2} maxLength={300} value={postalAddress}
            placeholder="Street address, city, state, postal code"
            onChange={event => setPostalAddress(event.target.value)}/>
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={consent}
            onChange={event => setConsent(event.target.checked)}
            className="mt-1 size-4"/>
          <span>I confirm that each address belongs to an adult who explicitly requested
            or opted in to receive marketing from this organization. I am authorized to send.</span>
        </label>
        {error && <WorkspaceNotice tone="attention">{error}</WorkspaceNotice>}
        {notice && <WorkspaceNotice tone="info">{notice}</WorkspaceNotice>}
        <ActionFooter>
          <Button type="button" variant="outline" disabled={working || postalAddress.trim().length<10}
            onClick={() => void send("test")}>Send Test to My Email</Button>
          <Button type="button" disabled={working || !consent || count<1 || count>25 ||
            postalAddress.trim().length<10}
            onClick={() => void send("campaign")}>
            {working ? "Queuing…" : "Send Email to " + count + " Recipients"}
          </Button>
        </ActionFooter>
      </div>
    </div>}
    <div className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Email sending history</h3>
        <Button type="button" size="sm" variant="outline" disabled={loading || working}
          onClick={() => setRefresh(value => value+1)}>Refresh Status</Button>
      </div>
      {loading ? <p role="status" className="mt-3 text-sm text-muted-foreground">
        Reading send history…</p> :
        history.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">
          No emails have been queued for this outreach.</p> :
        <ul className="mt-3 space-y-2">
          {history.map(batch => <li key={batch.id} className="border p-3 text-sm">
            <p className="font-medium">{batch.mode === "test" ? "Test · " : "Campaign · "}
              {new Date(batch.createdAt).toLocaleString()}</p>
            <p className="mt-1 text-muted-foreground">
              {batch.summary.accepted} provider accepted · {batch.summary.queued} queued ·
              {" "}{batch.summary.failed} failed · {batch.summary.suppressed} suppressed
            </p>
          </li>)}
        </ul>}
      <p className="mt-3 text-xs text-muted-foreground">
        Provider accepted means the email provider accepted the request,
        not that the recipient received or opened the message. Unsubscribe requests
        are respected on future marketing sends.
      </p>
    </div>
  </WorkspacePanel>;
}
