import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, Check, ExternalLink, MapPin, Settings, ShieldCheck, Star, Users } from "lucide-react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { useWorkspaceSession, workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { switchVerifiedMembership } from "@/lib/workspace-membership-switch";
import { getMyCanAccount, setMyCanFavoriteSite } from "@/modules/identity/my-can-account.functions";
import { mutationErrorMessage } from "@/lib/mutation-feedback";

/**
 * Universal CAN account surface. Changing a role happens through the existing
 * verified membership switcher, never by changing favorite Site preferences.
 */
export const Route = createFileRoute("/account/")({
  loader: async ({ context, location }) => {
    const result = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!result.session?.authenticated) {
      throw redirect({ to: "/access", search: { returnTo: location.href } });
    }
  },
  component: MyCanAccount,
});

const sectionLink = "inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary";

function MyCanAccount() {
  const { session } = useWorkspaceSession();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["my-can-account"],
    queryFn: () => getMyCanAccount(),
    enabled: session?.authenticated === true,
    retry: false,
    staleTime: 30_000,
  });
  if (!session?.authenticated) return null;
  const account = query.data;
  const visiblePlaces = account?.places.filter(place => {
    const q = search.toLowerCase().trim();
    return !q || [place.name, place.organizationName, place.city, place.region]
      .filter(Boolean).some(value => value?.toLowerCase().includes(q));
  }) ?? [];
  const favoriteCount = account?.places.filter(place => place.favorite).length ?? 0;
  const grantsById = new Set(session.grants.map(grant => grant.id));

  async function toggleFavorite(siteId: string, favorite: boolean) {
    if (busy) return;
    setError("");
    setBusy(siteId);
    try {
      await setMyCanFavoriteSite({ data: { siteId, favorite } });
      await queryClient.invalidateQueries({ queryKey: ["my-can-account"] });
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to update this favorite."));
    } finally {
      setBusy(null);
    }
  }
  async function switchWorkspace(grantId: string) {
    if (busy || !grantsById.has(grantId)) return;
    setError("");
    setBusy(grantId);
    try {
      await switchVerifiedMembership({
        grants: session.grants,
        activeGrantId: session.activeGrantId,
        grantId,
        queryClient,
      });
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to open this workspace."));
      setBusy(null);
    }
  }

  return <WorkspaceShell width="wide" eyebrow="Account" title="My CAN"
    subtitle="One account across schools, programs and community learning. Your saved places are separate from your memberships and permissions."
    actions={<Link to="/account/sessions" className={sectionLink}><Settings className="size-4" aria-hidden="true"/> Account security</Link>}>
    {query.isPending && <p role="status" className="mt-6 border border-border bg-card p-5 text-sm">Loading your account and places…</p>}
    {query.isError && <section role="alert" className="mt-6 border border-destructive bg-card p-5">
      <h2 className="font-semibold">Your CAN account could not be loaded</h2>
      <p className="mt-2 text-sm text-muted-foreground">Your existing workspace permissions have not changed. Check that account-favorites migration 0081 is installed.</p>
      <Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
    </section>}
    {error && <p role="alert" className="mt-5 border border-destructive bg-card p-4 text-sm">{error}</p>}
    {account?.identityNeedsReview && <p role="status" className="mt-6 border border-border bg-card p-4 text-sm">This login is linked to more than one Person record. CAN staff must verify and reconcile the identities before profile information is reused across schools. No records have been merged.</p>}
    {account && <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="workspaces-heading" className="border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="workspaces-heading" className="font-serif text-2xl">My workspaces</h2>
              <span className="text-xs text-muted-foreground">{account.workspaces.length} verified role{account.workspaces.length === 1 ? "" : "s"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Your personal account and verified roles at schools, programs and organizations.</p>
          </header>
          <div className="divide-y divide-border">
            {account.workspaces.map(workspace => <div key={workspace.grantId}
              className="flex flex-wrap items-center gap-3 px-5 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center border border-border bg-muted">
                <Users className="size-4" aria-hidden="true"/>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{workspace.place}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{workspace.role.replaceAll("_", " ")}{account.demoAccountSwitching ? " · " + workspace.personName : ""}</p>
              </div>
              {workspace.active
                ? <Link to="/home" className={sectionLink}>Current workspace <ArrowRight className="size-4" aria-hidden="true"/></Link>
                : <Button variant="outline" size="sm" disabled={busy !== null || !grantsById.has(workspace.grantId)}
                    onClick={() => void switchWorkspace(workspace.grantId)}>Open workspace</Button>}
            </div>)}
          </div>
          {account.demoAccountSwitching && <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Demo switching may show different test people. Production accounts only display independently verified account memberships.
          </p>}
        </section>
        <section aria-labelledby="places-heading" className="border border-border bg-card">
          <header className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="places-heading" className="font-serif text-2xl">My places</h2>
              <span className="text-xs text-muted-foreground">{favoriteCount} saved</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Save published learning locations and schools where you have verified access. Favorites never enroll you or share your profile.</p>
            {!account.favoritesReady && <p role="status" className="mt-4 border border-border bg-muted/30 p-3 text-sm">
              Saved locations are not yet available in this database. Your school access remains unchanged.
            </p>}
            <label htmlFor="place-search" className="mt-4 block text-xs font-semibold">Find a location</label>
            <input id="place-search" type="search" value={search}
              onChange={event => setSearch(event.target.value)} placeholder="Search site, organization or city"
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"/>
          </header>
          <div className="divide-y divide-border">
            {visiblePlaces.map(place => <article key={place.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden="true"/>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{place.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[place.organizationName, [place.city, place.region].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {place.url ? <a href={place.url} target="_blank" rel="noopener noreferrer" className={sectionLink}
                  aria-label={"Visit " + place.name}>Visit <ExternalLink className="size-3" aria-hidden="true"/></a>
                  : <span className="text-xs text-muted-foreground">Workspace-only</span>}
                <Button variant={place.favorite ? "secondary" : "outline"} size="sm"
                  disabled={busy !== null || !account.favoritesReady} aria-pressed={place.favorite}
                  aria-label={(place.favorite ? "Remove " : "Save ") + place.name + (place.favorite ? " from favorites" : " to favorites")}
                  onClick={() => void toggleFavorite(place.id, !place.favorite)}>
                  {place.favorite ? <Check className="size-4" aria-hidden="true"/> : <Star className="size-4" aria-hidden="true"/>}
                  {place.favorite ? "Saved" : "Save"}
                </Button>
              </div>
            </article>)}
            {!visiblePlaces.length && <p className="p-5 text-sm text-muted-foreground">
              {search ? "No available locations match your search." : "No published sites or authorized school locations are available yet."}
            </p>}
          </div>
        </section>
      </div>
      <aside aria-label="Account details and quick links" className="min-w-0 space-y-6">
        <section className="border border-border bg-card p-5">
          <h2 className="font-serif text-2xl">My account</h2>
          <p className="mt-4 text-sm font-semibold">{account.fullName}</p>
          <p className="mt-1 break-all text-sm text-muted-foreground">{account.email}</p>
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" aria-hidden="true"/>
            {account.verified ? "Email verified" : "Email verification not recorded"}
          </p>
          <div className="mt-5 border-t border-border pt-4">
            <Link to="/profiles" className={sectionLink}>Open my profile <ArrowRight className="size-4" aria-hidden="true"/></Link>
          </div>
        </section>
        <section className="border border-border bg-card p-5">
          <h2 className="font-serif text-2xl">My learning</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Your classes, program registrations and history remain with their authorized educational records.</p>
          <Link to="/home" className={sectionLink}><BookOpen className="size-4" aria-hidden="true"/> Open current learning workspace</Link>
        </section>
        <section className="border border-border bg-muted/30 p-5">
          <h2 className="font-semibold text-sm">Identity is not authority</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">Your CAN login stays with you. A school must separately approve enrollment, an organization must grant a staff role, and guardianship must be verified. Favorites never change access.</p>
        </section>
      </aside>
    </div>}
  </WorkspaceShell>;
}
