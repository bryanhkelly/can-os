import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getLaunchWebsitePreparation } from "@/modules/programs/launch-website.functions";
import { LaunchWebsiteEditorHandoff } from "./LaunchWebsiteEditorHandoff";

type Website = Awaited<ReturnType<typeof getLaunchWebsitePreparation>>;

/** School Launch owns readiness and access; Website Studio owns authoring and previews. */
export function LaunchWebsiteStep({ programId }: { programId: string }) {
  return <WebsiteStep key={programId} programId={programId} />;
}

function WebsiteStep({ programId }: { programId: string }) {
  const [data, setData] = useState<Website | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    void getLaunchWebsitePreparation({ data: { programId } })
      .then(result => { if (current) { setData(result); setError(""); } })
      .catch(() => { if (current) { setData(null); setError("School website status could not be loaded. Check your access and retry."); } });
    return () => { current = false; };
  }, [programId, retry]);

  return <section id="launch-website" aria-label="Prepare your school website" className="mt-5 border bg-card p-5">
    <p className="text-xs font-semibold uppercase text-muted-foreground">School preparation · Website</p>
    <h2 className="mt-1 font-serif text-2xl">Your school website</h2>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {data ? <LaunchWebsitePreview data={data} /> :
      !error && <p role="status" className="mt-3 text-sm">Checking the school's saved website records…</p>}
    <Button type="button" variant="outline" size="sm" className="mt-4"
      onClick={() => { setData(null); setError(""); setRetry(value => value + 1); }}>
      Refresh website status
    </Button>
  </section>;
}

export function LaunchWebsitePreview({ data }: { data: Website }) {
  const availability = data.publicAvailability === "live" ? "Live, HTTPS verified"
    : data.publicAvailability === "not_published" ? "Not published"
    : data.publicAvailability === "hosting_disabled" ? "Hosting not configured"
    : "Published but not reachable";
  return <div className="mt-4 space-y-4 text-sm">
    <p>Use Website Studio to choose a template, prepare school-owned photos and copy, review desktop/mobile pages, and save a private draft. Publishing requires the exact Site editor authorization.</p>
    <dl className="grid gap-3 border bg-background p-4 sm:grid-cols-2">
      <div><dt className="text-xs text-muted-foreground">School site</dt>
        <dd className="mt-1 font-semibold">{data.programName}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Reserved address</dt>
        <dd className="mt-1 break-all font-semibold">{data.host || "Not reserved"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Content status</dt>
        <dd className="mt-1 font-semibold">{data.status === "published" ? "Church content published" : "Private preparation"}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Public availability</dt>
        <dd className="mt-1 font-semibold">{availability}</dd></div>
    </dl>
    {data.publicAvailability !== "live" && <p role="status" className="border p-3">
      {data.publicAvailability === "not_published"
        ? "Finish and review your school website in Website Studio. Family invitations can continue while publication is pending."
        : "Ask CAN to verify the public address. Website preparation and family invitations can continue separately."}
    </p>}
    {data.includesSuggestions && <p className="border p-3 text-muted-foreground">
      Suggested wording remains private until separately reviewed and saved. It is not approved school information.
    </p>}
    <div className="border bg-background p-4">
      <h3 className="font-serif text-xl">School photography</h3>
      <p className="mt-2 text-muted-foreground">Use Website Studio's photo-folder workflow. Image rights and child consent must be confirmed before public use. Missing school photos are not replaced with generated artwork.</p>
    </div>
    <nav aria-label="School website preparation" className="flex flex-wrap items-center gap-4">
      <LaunchWebsiteEditorHandoff siteId={data.siteId} programId={data.programId} />
      <Link to="/admin" search={{ siteId: data.siteId, inviteRole: "site_website_editor" }}
        className="min-h-11 content-center font-semibold text-primary underline">Invite a website editor</Link>
      <Link to="/sites/$siteId/publish" params={{ siteId: data.siteId }}
        className="min-h-11 content-center font-semibold text-primary underline">Institutional publishing review</Link>
    </nav>
    {data.host && data.publicAvailability === "live" && <a href={`https://${data.host}/`}
      target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-primary underline">
      View the verified public website
    </a>}
    <p className="text-xs text-muted-foreground">Editing, publishing and school-opening approvals are separate, server-verified actions.</p>
    <Button asChild variant="outline"><Link to="/launch/school" search={{ siteId: data.siteId, programId: data.programId, step: "families" }}>Continue to family invitations</Link></Button>
  </div>;
}
