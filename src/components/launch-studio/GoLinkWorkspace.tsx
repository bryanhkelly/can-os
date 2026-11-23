import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyLinkButton } from "@/components/links/CopyLinkButton";
import { buildUrlDestination } from "@/domain/url-destinations";
import { Select } from "@/components/ui/select";
import { WorkspacePanel } from "@/components/workspace";
import type { GoDestination } from "@/domain/site-go-links";
import {
  createSiteGoLink, listSiteGoLinks, revokeSiteGoLink,
} from "@/modules/engagement/site-go-links.functions";

type GoLink = Awaited<ReturnType<typeof listSiteGoLinks>>[number];
type Kind = GoDestination["kind"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const labels: Record<Kind,string> = {
  "site-page": "Published Site page or interest",
  "adult-training": "Specific adult training registration",
  "class": "Specific Class",
  "enrichment": "Community or enrichment Season",
  "information": "Curated information journey",
};
const pageLabels = [
  ["contact", "Express interest / Contact"],
  ["home", "Site homepage"],
  ["programs", "Programs"],
  ["experiences", "Experiences"],
  ["courses", "Courses"],
  ["classes", "Classes"],
  ["academics", "Academics"],
  ["admissions", "Admissions"],
] as const;
function textError(cause: unknown) {
  return cause instanceof Error ? cause.message : "Unable to complete this Go link action.";
}

/** Shares an immutable link to an existing destination. No shadow enrollment or prospect store. */
export function GoLinkWorkspace({ siteId, packageId }: { siteId: string; packageId: string }) {
  const [links, setLinks] = useState<GoLink[]>([]);
  const [readState, setReadState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [kind, setKind] = useState<Kind>("site-page");
  const [page, setPage] = useState<GoDestination & {kind:"site-page"}>( {kind:"site-page",page:"contact"} );
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    setReadState("loading");
    listSiteGoLinks({data:{siteId,packageId}})
      .then(items => { if (live) {setLinks(items);setReadState("ready");} })
      .catch(() => { if (live) setReadState("error"); });
    return () => { live = false; };
  }, [siteId, packageId, retry]);

  const isValidTarget = kind === "site-page"
    || (kind === "information" ? /^[a-z][a-z0-9-]{1,60}$/.test(target)
    : uuid.test(target));
  function destination(): GoDestination {
    if (kind === "site-page") return page;
    if (kind === "adult-training") return {kind, releaseId:target};
    if (kind === "class") return {kind, classId:target};
    if (kind === "enrichment") return {kind, seasonId:target};
    return {kind:"information", journeyId:target};
  }
  async function create() {
    if (busy || !isValidTarget || readState !== "ready") return;
    setBusy(true);setError("");setNotice("");
    try {
      const link = await createSiteGoLink({data:{siteId,packageId,destination:destination()}});
      setLinks(previous => [link, ...previous]);
      setNotice("Go link created. Copy it to use in an invitation, QR code, or message.");
    } catch (cause) {setError(textError(cause));}
    finally {setBusy(false);}
  }
  async function revoke(link: GoLink) {
    if (busy || link.status === "revoked") return;
    if (!window.confirm("Revoke this link? Existing flyers and messages using it will no longer work.")) return;
    setBusy(true);setError("");setNotice("");
    try {
      await revokeSiteGoLink({data:{siteId,packageId,linkId:link.id}});
      setLinks(items => items.map(item => item.id === link.id ? {...item,status:"revoked" as const} : item));
      setNotice("Go link revoked. Its destination remains unavailable.");
    } catch (cause) {setError(textError(cause));}
    finally {setBusy(false);}
  }
  return <WorkspacePanel title="Go links" description="Create a short, revocable link that opens the right public page or registration experience. Links never grant access or enroll a participant.">
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Destination
        <Select value={kind} onChange={event=>{setKind(event.target.value as Kind);setTarget("");}}>
          {Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </Select>
      </label>
      {kind === "site-page" ? <label className="grid gap-1 text-sm font-medium">Published page
        <Select value={page.page} onChange={event=>setPage({kind:"site-page",page:event.target.value as typeof page.page})}>
          {pageLabels.map(([value,label])=><option value={value} key={value}>{label}</option>)}
        </Select>
      </label> : <label className="grid gap-1 text-sm font-medium">
        {kind === "information" ? "Journey ID" : kind === "adult-training" ? "Published training release ID" : kind === "class" ? "Class ID" : "Enrichment Season ID"}
        <Input value={target} onChange={event=>setTarget(event.target.value.trim())}
          placeholder={kind==="information"?"teach-with-can":"Enter the exact ID"} />
      </label>}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">
      A published Site is required for Site pages. Other targets retain their own publication, eligibility, consent and access checks. A planning-only program is not a registration destination.
    </p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" disabled={busy||!isValidTarget||readState!=="ready"} onClick={()=>void create()}>
        {busy?"Working…":"Create Go link"}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={()=>setRetry(n=>n+1)}>Refresh links</Button>
    </div>
    {readState==="loading"&&<p role="status" className="mt-4 text-sm">Loading saved Go links…</p>}
    {readState==="error"&&<p role="alert" className="mt-4 text-sm">Saved links could not be read. Refresh to try again.</p>}
    {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
    {readState==="ready"&&<div className="mt-5 grid gap-3">
      {!links.length&&<p className="text-sm text-muted-foreground">No Go links have been created for this outreach plan.</p>}
      {links.map(link=><div key={link.id} className="flex flex-wrap items-center justify-between gap-3 border p-3">
        <div className="min-w-0">
          <p className="font-mono text-sm select-all">{buildUrlDestination({kind:"go",code:link.code}).href}</p>
          <p className="mt-1 text-xs text-muted-foreground">{labels[link.destination.kind]} · {link.status === "active"?"Active":"Revoked"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {link.status === "active" && <CopyLinkButton destination={{kind:"go",code:link.code}} />}
          <Button type="button" variant="outline" size="sm" disabled={busy||link.status!=="active"} onClick={()=>void revoke(link)}>Revoke</Button>
        </div>
      </div>)}
    </div>}
  </WorkspacePanel>;
}
