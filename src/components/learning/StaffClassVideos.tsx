import { useState } from "react";
import { ClassVideoUploadForm } from "./ClassVideoUploadForm";
import { ClassVideoPlayer } from "./ClassVideoPlayer";
import { getStaffClassVideoOptions, getStaffClassVideoPreview } from "@/modules/learning/class-video-upload.functions";
import { normalizeClientError } from "@/lib/client-error";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

export function StaffClassVideos({ sections, videos }: {
  sections: readonly { id: string; title: string }[];
  videos: readonly { id: string; title: string; kind: string; sectionId: string | null; url: string | null }[];
}) {
  const [sectionId, setSectionId] = useState("");
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getStaffClassVideoOptions>> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  async function load() {
    if (!sectionId || pending) return;
    setPending(true); setError(""); setOptions(null);
    try { setOptions(await getStaffClassVideoOptions({ data: { sectionId } })); }
    catch (failure) { setError(normalizeClientError(failure, "Unable to load video management for this class.").message); }
    finally { setPending(false); }
  }
  return <section className="space-y-4 rounded-xl border p-5" aria-label="Staff class videos">
    <h2 className="font-serif text-2xl">Class videos</h2>
    <p className="text-sm text-muted-foreground">Upload classwide or lesson-linked videos for students. Staff can preview before sharing the class page.</p>
    <form noValidate className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();setAttempted(true);if(sectionId)void load();
    }}>
      <Field label="Video class" required className="min-w-52 flex-1"
        error={attempted&&!sectionId?"Select a class to manage its videos.":undefined}>
        <Select value={sectionId} disabled={pending}
        onChange={event => { setSectionId(event.target.value); setOptions(null); setError(""); }}
        >
        <option value="">Select a class</option>
        {sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
      </Select></Field>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Loading..." : "Manage class videos"}
      </Button>
    </form>
    {error && <p role="alert" className="text-sm">{error}</p>}
    {options && <ClassVideoUploadForm key={sectionId} sectionId={sectionId} lessons={options.lessons} enabled={options.enabled}/>}
    {options && <ul className="space-y-3">{videos.filter(video => video.kind === "video" && video.sectionId === sectionId)
      .map(video => <li key={video.id} className="rounded border p-3">
        <ClassVideoPlayer title={video.title} url={video.url} loadUrl={!video.url ? async () =>
          (await getStaffClassVideoPreview({ data: { sectionId, supplementId: video.id } })).downloadUrl : undefined}/>
      </li>)}</ul>}
  </section>;
}
