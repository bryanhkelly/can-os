import { Link } from "@tanstack/react-router";
import { BookOpen, Check } from "lucide-react";
import type { getCurriculumMarketplace } from "@/modules/learning/curriculum-marketplace.functions";

type Marketplace = Awaited<ReturnType<typeof getCurriculumMarketplace>>;
type Pack = Marketplace["packs"][number];

function isSelected(pack: Pack) {
  return pack.adoption?.status === "active" && pack.adoption.versionId === pack.versionId;
}

export function CurriculumLibrary({ marketplaces }: { marketplaces: readonly Marketplace[] }) {
  const selectionOrder = [...marketplaces].sort((a, b) => Number(b.packs.some(isSelected)) - Number(a.packs.some(isSelected)));
  return (
    <div className="space-y-8">
      {selectionOrder.map((market) => {
        const selected = market.packs.filter(isSelected);
        return (
          <section key={market.program.id} className="space-y-6" aria-label={`Curriculum for ${market.program.name}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{market.program.name}</p>
                <h2 className="mt-1 font-serif text-2xl">Your curriculum</h2>
              </div>
              <Link to="/operations/curriculum-marketplace" search={{ programId: market.program.id }}
                hash="curriculum-packs" className="rounded-lg border px-4 py-2 text-sm font-medium">
                Browse curriculum
              </Link>
            </div>
            {selected.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {selected.map((pack) => <CurriculumCard key={pack.versionId} pack={pack} programId={market.program.id} selected />)}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-6">
                <BookOpen aria-hidden="true" className="size-8 text-muted-foreground" />
                <h3 className="text-lg font-semibold">You haven't selected a curriculum</h3>
                <p className="text-sm text-muted-foreground">Browse published curriculum and review a release for {market.program.name}.</p>
                <Link to="/operations/curriculum-marketplace" search={{ programId: market.program.id }}
                  hash="curriculum-packs" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  Choose curriculum
                </Link>
              </div>
            )}
            {market.packs.length === 0 && (
              <p role="status" className="text-sm text-muted-foreground">No published curriculum is available for this program yet.</p>
            )}
          </section>
        );
      })}
      {marketplaces.map((market) => {
        const available = market.packs.filter((pack) => !isSelected(pack));
        return available.length > 0 ? (
          <section key={market.program.id} className="space-y-4" aria-label={`Browse curriculum for ${market.program.name}`}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{market.program.name}</p>
              <h2 className="mt-1 font-serif text-2xl">Browse curriculum</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {available.map((pack) => <CurriculumCard key={pack.versionId} pack={pack} programId={market.program.id} selected={false} />)}
            </div>
          </section>
        ) : null;
      })}
    </div>
  );
}

function CurriculumCard({ pack, programId, selected }: { pack: Pack; programId: string; selected: boolean }) {
  return (
    <article className={`flex flex-col overflow-hidden rounded-xl border bg-card ${selected ? "border-primary/40" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-5 py-4">
        <BookOpen aria-hidden="true" className="size-7 text-primary" />
        {selected ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><Check aria-hidden="true" className="size-4" />Selected curriculum</span>
        ) : <span className="text-xs text-muted-foreground">{pack.entitlement === "active" ? "In your library" : "Published curriculum"}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-xs text-muted-foreground">{pack.publisherName} · Version {pack.version}</p>
        <h3 className="font-serif text-xl font-semibold"><Link to="/operations/curriculum-marketplace" search={{ programId }} hash={`curriculum-pack-${pack.versionId}`} className="underline underline-offset-4">{pack.name}</Link></h3>
        <p className="text-sm text-muted-foreground">{pack.description}</p>
        <p className="text-sm font-medium">{pack.courses.length} {pack.courses.length === 1 ? "course" : "courses"} · {pack.licenseCode}</p>
        {selected && (
          <ul className="space-y-2 border-t pt-3" aria-label={`Courses in ${pack.name}`}>
            {pack.courses.map((course) => (
              <li key={course.courseVersionId} className="text-sm">
                <p className="font-medium">{course.title}</p>
                <p className="text-xs text-muted-foreground">{course.subject} · {course.code}
                  {course.preview ? ` · ${course.preview.moduleCount} ${course.preview.moduleCount === 1 ? "unit" : "units"} · ${course.preview.lessonCount} ${course.preview.lessonCount === 1 ? "lesson" : "lessons"}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
        {pack.entitlement !== "active" && selected && (
          <p role="status" className="text-sm text-destructive">License {pack.entitlement ?? "unavailable"}. Publisher review is required before this curriculum can be used.</p>
        )}
        {!selected && pack.adoption && (
          <p className="text-xs text-muted-foreground">
            {pack.adoption.status === "active" ? "Another release is selected. Any upgrade requires review." : `Previous selection is ${pack.adoption.status}; review is required.`}
          </p>
        )}
        <Link to="/operations/curriculum-marketplace" search={{ programId }} hash={`curriculum-pack-${pack.versionId}`}
          className="mt-auto inline-flex justify-center rounded-lg border px-4 py-2 text-sm font-semibold">
          {selected ? "View curriculum" : "Review curriculum"}
        </Link>
      </div>
    </article>
  );
}
