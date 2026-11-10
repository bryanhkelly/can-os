import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useEffect, useState } from "react";
import { RefreshCw, UserRound } from "lucide-react";

export type ProfilePhotoReader = (input: { data: { personId: string } }) => Promise<{ url: string | null }>;

export function ProfilePhoto({ personId, name, revision = 0, size = "profile", readPhoto }: { personId?: string; name: string; revision?: number; size?: "profile" | "compact"; readPhoto?: ProfilePhotoReader }) {
  const [photo, setPhoto] = useState<{ key: string; url: string | null; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${personId}:${revision}:${attempt}`;
  useEffect(() => {
    if (!personId || !readPhoto) return;
    const load = readPhoto, targetPersonId = personId;
    let active = true;
    async function refresh() {
      try {
        const result = await load({ data: { personId: targetPersonId } });
        if (active) setPhoto({ key, url: result.url, error: "" });
      } catch (cause) { if (active) setPhoto({ key, url: null, error: mutationErrorMessage(cause, "Unable to load profile photo.") }); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 240_000);
    return () => { active = false; clearInterval(timer); };
  }, [personId, key, readPhoto]);
  const current = photo?.key === key ? photo : null;
  const loading = Boolean(personId && readPhoto && !current);
  return <div className={`relative shrink-0 overflow-hidden rounded-none border bg-muted ${size === "compact" ? "size-10" : "size-16 sm:size-20"}`}>
    {current?.url ? <img src={current.url} alt={`${name}'s profile`} referrerPolicy="no-referrer" onError={() => setPhoto({ key, url: null, error: "Profile photo could not be displayed." })}
      className="h-full w-full object-cover"/> : <span role="img" aria-label={`${name}: ${loading ? "loading photo" : current?.error ? "photo unavailable" : "no profile photo"}`}
        title={current?.error || name} className="flex h-full w-full items-center justify-center text-muted-foreground"><UserRound aria-hidden="true" className="size-6"/></span>}
    {current?.error && <button type="button" title="Retry profile picture" aria-label={`Retry profile picture for ${name}`}
      onClick={() => setAttempt(value => value + 1)} className="absolute inset-0 flex items-end justify-end bg-card/40 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><RefreshCw aria-hidden="true" className="size-4"/></button>}
  </div>;
}
