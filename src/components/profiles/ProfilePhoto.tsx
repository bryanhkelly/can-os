import { useEffect, useState } from "react";
import { PersonMark } from "@/components/workspace";

export function ProfilePhoto({ personId, name, revision = 0 }: { personId?: string; name: string; revision?: number }) {
  const [url, setUrl] = useState<string | null>(null), [error, setError] = useState("");
  useEffect(() => {
    if (!personId) return;
    let active = true;
    async function refresh() {
      try {
        const { getProfilePhoto } = await import("@/modules/profiles/person-profile.functions");
        const photo = await getProfilePhoto({ data: { personId } });
        if (active) { setUrl(photo.url); setError(""); }
      } catch (cause) { if (active) { setUrl(null); setError(cause instanceof Error ? cause.message : "Unable to load profile photo."); } }
    }
    setUrl(null);setError("");void refresh();
    const timer = setInterval(() => void refresh(), 240_000);
    return () => { active = false; clearInterval(timer); };
  }, [personId, revision]);
  return <div className="flex max-w-48 flex-col gap-2">
    {url ? <img src={url} alt={`${name}'s profile`} referrerPolicy="no-referrer" onError={() => { setUrl(null); setError("Profile photo could not be displayed."); }}
      className="size-16 rounded-xl border object-cover"/> : <PersonMark name={name}/>}
    {error && <span role="alert" className="text-xs text-muted-foreground">{error}</span>}
  </div>;
}
