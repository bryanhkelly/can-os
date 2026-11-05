import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  churchReferenceKinds, churchSourcesChangedEvent, type ChurchReferenceKind,
} from "@/domain/church-source-references";
import {
  getChurchSourceReferenceView, removeChurchSourceReferenceCommand,
  saveChurchSourceReferenceCommand,
} from "@/modules/sites/church-source-references.functions";

type Reference = Awaited<ReturnType<typeof getChurchSourceReferenceView>>[number];
const labels: Record<ChurchReferenceKind, string> = {
  website: "Church website", youtube: "YouTube",
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
};
const referenceStatusLabels: Record<"saved"|"fetchable"|"unsupported"|"blocked"|"failed", string> = {
  saved: "Saved privately; no website extraction yet",
  fetchable: "Public church text retrieved for private review",
  unsupported: "Reference saved; automatic social import unavailable",
  blocked: "Automated reading blocked by website access or safety safeguards",
  failed: "Automated reading unsuccessful; manual entry remains available",
};
const descriptions: Record<ChurchReferenceKind, string> = {
  website: "Save your existing public church website. Where enabled, you can request private editorial suggestions.",
  youtube: "Save your public YouTube channel for reference; no videos are imported.",
  instagram: "Save your Instagram profile for reference; no posts are imported.",
  facebook: "Save your Facebook page for reference; no posts are imported.",
  tiktok: "Save your TikTok profile for reference; no videos are imported.",
};

export function ChurchSourceReferenceEditor() {
  const router = useRouter();
  const [references, setReferences] = useState<Reference[]>([]);
  const [urls, setUrls] = useState<Record<ChurchReferenceKind, string>>({
    website: "", youtube: "", instagram: "", facebook: "", tiktok: "",
  });
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ChurchReferenceKind | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempted,setAttempted]=useState<Partial<Record<ChurchReferenceKind,boolean>>>({});
  useEffect(() => {
    let active = true;
    void getChurchSourceReferenceView({ data: {} }).then(items => {
      if (!active) return;
      setReferences(items);
      setUrls(old => ({ ...old, ...Object.fromEntries(items.map(item => [item.kind, item.normalizedUrl])) }));
      setLoading(false);
    }).catch(() => {
      if (active) { setError("Church sources could not be loaded. Check your Site permissions and retry."); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent, kind: ChurchReferenceKind) {
    event.preventDefault();
    if (busy) return;
    setAttempted(old=>({...old,[kind]:true}));
    let validUrl=false;
    try { const parsed=new URL(urls[kind]);validUrl=parsed.protocol==="http:"||parsed.protocol==="https:"; } catch { /* invalid URL */ }
    if(!authorized||!validUrl)return;
    setError(""); setMessage(""); setBusy(kind);
    try {
      await saveChurchSourceReferenceCommand({
        data: { kind, url: urls[kind], authorizedToSubmit: true },
      });
      const items = await getChurchSourceReferenceView({ data: {} });
      setReferences(items);
      window.dispatchEvent(new Event(churchSourcesChangedEvent));
      setMessage(`${labels[kind]} saved as a private reference. No content was imported or published.`);
      setAttempted(old=>({...old,[kind]:false}));
      void router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save church reference.");
    } finally { setBusy(null); }
  }

  async function remove(kind: ChurchReferenceKind) {
    if (busy) return;
    setError(""); setMessage(""); setBusy(kind);
    try {
      await removeChurchSourceReferenceCommand({ data: { kind } });
      setReferences(old => old.filter(item => item.kind !== kind));
      setUrls(old => ({ ...old, [kind]: "" }));
      window.dispatchEvent(new Event(churchSourcesChangedEvent));
      setMessage(`${labels[kind]} reference removed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove church reference.");
    } finally { setBusy(null); }
  }

  return <section aria-labelledby="church-references-title"
    className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional · Church identity</p>
    <h2 id="church-references-title" className="mt-1 font-serif text-2xl font-semibold">
      Does your church have an existing website or public social profiles?
    </h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Share public links so your school website editor can refer to your church's story and identity.
      These references are private to authorized Site editors. Adding links does not verify school
      facts, grant rights to photos or videos, publish content, or change school authorization.
      This step is optional; you can always write your church story manually below.
    </p>
    <Field className="mt-4 text-sm" label="I am authorized to provide these public church references." required>
      <Checkbox checked={authorized} onChange={event => setAuthorized(event.target.checked)}/>
    </Field>
    {loading && <p role="status" className="mt-3 text-sm">Loading saved church references…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!loading && <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {churchReferenceKinds.map(kind => {
        const existing = references.find(item => item.kind === kind);
        let validUrl=false;
        try { const parsed=new URL(urls[kind]);validUrl=parsed.protocol==="http:"||parsed.protocol==="https:"; } catch { /* invalid URL */ }
        return <form key={kind} noValidate onSubmit={event => void save(event, kind)}
          className="rounded-xl border border-border/70 p-4">
          <label htmlFor={`church-source-${kind}`} className="block font-semibold">{labels[kind]}</label>
          <p className="mt-1 text-xs text-muted-foreground">{descriptions[kind]}</p>
          <Field label={labels[kind]} className="sr-only" required
            error={attempted[kind]&&!validUrl?"Enter a valid public web URL.":undefined}>
          <Input id={`church-source-${kind}`} type="url" maxLength={2048}
            placeholder={kind === "website" ? "https://yourchurch.org" : "https://"}
            value={urls[kind]} onChange={event => setUrls(old => ({ ...old, [kind]: event.target.value }))}
            className="mt-3 w-full" />
          </Field>
          {attempted[kind]&&!authorized&&<FieldError className="mt-2">Confirm that you are authorized to provide this reference.</FieldError>}
          {existing && <p className="mt-2 text-xs text-muted-foreground">
            {referenceStatusLabels[existing.referenceState] ?? "Reference saved privately"}
          </p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" disabled={busy !== null}>
              {busy === kind ? "Saving…" : existing ? "Update link" : "Save link"}
            </Button>
            {existing && <Button type="button" variant="outline" disabled={busy !== null}
              onClick={() => void remove(kind)}>
              Remove
            </Button>}
          </div>
        </form>;
      })}
    </div>}
    <p className="mt-4 text-xs text-muted-foreground">
      Photos, logos and other copyrighted works require separate rights confirmation.
      For identifiable children, appropriate guardian consent is required. Church
      descriptions are reviewed separately through the existing content editor.
    </p>
  </section>;
}
