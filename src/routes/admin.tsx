import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  inviteStaffMember,
  listAccessAccounts,
  listPeople,
  listScopedSites,
  setGrantActive,
} from "@/modules/identity/admin.functions";

export const Route = createFileRoute("/admin")({ component: AdminConsolePage });

const roles = ["student", "teacher", "guardian", "registrar", "specialist"] as const;

type Site = Awaited<ReturnType<typeof listScopedSites>>["sites"][number];
type Account = Awaited<ReturnType<typeof listAccessAccounts>>["accounts"][number];
type Person = Awaited<ReturnType<typeof listPeople>>["people"][number];

const authMessage = "Sign in with an authorized registrar account to manage access.";

function AdminConsolePage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>("teacher");
  const [siteId, setSiteId] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([listScopedSites(), listAccessAccounts(), listPeople({ data: {} })])
      .then(([siteResult, accountResult, peopleResult]) => {
        if (!active) return;
        setSites(siteResult.sites);
        setAccounts(accountResult.accounts);
        setPeople(peopleResult.people);
        setLoading(false);
      })
      .catch(() => {
        if (active) { setAuthError(authMessage); setLoading(false); }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (authError) return;
    let active = true;
    listPeople({ data: { ...(query.trim() ? { query: query.trim() } : {}) } })
      .then(result => { if (active) setPeople(result.people); })
      .catch(() => { if (active) setError("Unable to search the people directory."); });
    return () => { active = false; };
  }, [query, authError]);

  async function refresh() {
    const [accountResult, peopleResult] = await Promise.all([
      listAccessAccounts(),
      listPeople({ data: { ...(query.trim() ? { query: query.trim() } : {}) } }),
    ]);
    setAccounts(accountResult.accounts);
    setPeople(peopleResult.people);
  }

  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await inviteStaffMember({
        data: {
          email,
          firstName,
          lastName,
          role,
          ...(siteId ? { siteId } : {}),
        },
      });
      setNotice(result.created
        ? `Invitation recorded for ${email}. Trigger the access-link flow so they receive their sign-in challenge.`
        : `${email} already has this grant; no changes were made.`);
      setEmail("");
      setFirstName("");
      setLastName("");
      setRole("teacher");
      setSiteId("");
      await refresh();
    } catch {
      setError("Unable to invite this staff member. Check the details and your permissions.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleGrant(grantId: string, active: boolean) {
    setError("");
    try {
      await setGrantActive({ data: { grantId, active: !active } });
      await refresh();
    } catch {
      setError("Unable to update this grant. You cannot deactivate your own active grant.");
    }
  }

  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-5xl">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Admin</p>
      <h1 className="mt-2 font-serif text-4xl">Admin console</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Invite staff, manage access accounts, and browse the people directory for your organizations.</p>
      {loading && <p className="mt-8 text-sm" role="status">Loading admin console…</p>}
      {authError && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{authError}</p>}
      {!loading && !authError && <>
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {notice && <p className="mt-8 rounded-lg border bg-muted p-4 text-sm" role="status">{notice}</p>}

        <section className="mt-8 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Invite staff</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a person, access account, and grant in one step. This does not send email.</p>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submitInvite}>
            <label className="block text-sm font-semibold">
              Email
              <input className="mt-2 w-full rounded-lg border bg-background p-3" type="email" required value={email} onChange={event => setEmail(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold">
              Role
              <select className="mt-2 w-full rounded-lg border bg-background p-3 capitalize" value={role} onChange={event => setRole(event.target.value)}>
                {roles.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              First name
              <input className="mt-2 w-full rounded-lg border bg-background p-3" required maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold">
              Last name
              <input className="mt-2 w-full rounded-lg border bg-background p-3" required maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold sm:col-span-2">
              Site (optional)
              <select className="mt-2 w-full rounded-lg border bg-background p-3" value={siteId} onChange={event => setSiteId(event.target.value)}>
                <option value="">Organization-wide</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg border bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={busy}>
                {busy ? "Inviting…" : "Invite staff member"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Access accounts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Toggle individual grants to activate or deactivate access.</p>
          {accounts.length === 0 && <p className="mt-4 text-sm">No access accounts found in your organization scope.</p>}
          {accounts.length > 0 && <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Person</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.flatMap(account => account.grants.map(grant =>
                  <tr key={grant.grantId} className="border-b last:border-0">
                    <td className="py-2 pr-4">{account.email}{account.disabled ? " (disabled)" : ""}</td>
                    <td className="py-2 pr-4">{grant.personName}</td>
                    <td className="py-2 pr-4 capitalize">{grant.role}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded-full border px-3 py-1 text-xs">{grant.active ? "Active" : "Inactive"}</span>
                    </td>
                    <td className="py-2">
                      <button className="rounded-lg border px-3 py-1 text-xs font-semibold" type="button" onClick={() => toggleGrant(grant.grantId, grant.active)}>
                        {grant.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>

        <section className="mt-8 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">People directory</h2>
          <label className="mt-4 block max-w-sm text-sm font-semibold">
            Search
            <input className="mt-2 w-full rounded-lg border bg-background p-3" type="search" placeholder="Search by name" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          {people.length === 0 && <p className="mt-4 text-sm">No people found.</p>}
          {people.length > 0 && <div className="mt-4 grid gap-4">
            {people.map(person => <article key={person.personId} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-semibold">{person.preferredName ?? person.firstName} {person.lastName}</h3>
                <span className="rounded-full border px-3 py-1 text-xs">{person.active ? "Active" : "Inactive"}</span>
              </div>
              {person.grants.length > 0 && <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {person.grants.map(grant =>
                  <li key={grant.grantId} className="capitalize">{grant.role} · {grant.accountEmail} · {grant.active ? "active" : "inactive"}</li>
                )}
              </ul>}
            </article>)}
          </div>}
        </section>
      </>}
    </div>
  </main>;
}
