import { useState } from "react";
import { ClassVideoUploadForm } from "./ClassVideoUploadForm";
import { ClassVideoPlayer } from "./ClassVideoPlayer";
import { getStaffClassVideoOptions, getStaffClassVideoPreview } from "@/modules/learning/class-video-upload.functions";
import { normalizeClientError } from "@/lib/client-error";

export function StaffClassVideos({ sections, videos }: {
  sections: readonly { id: string; title: string }[];
  videos: readonly { id: string; title: string; kind: string; sectionId: string | null; url: string | null }[];
}) {
  const [sectionId, setSectionId] = useState("");
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getStaffClassVideoOptions>> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void load(); }}>
      <label className="text-sm">Video class<select required value={sectionId} disabled={pending}
        onChange={event => { setSectionId(event.target.value); setOptions(null); setError(""); }}
        className="mt-1 block rounded border p-2">
        <option value="">Select a class</option>
        {sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
      </select></label>
      <button type="submit" disabled={!sectionId || pending} className="rounded border px-4 py-2 text-sm">
        {pending ? "Loading..." : "Manage class videos"}
      </button>
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
