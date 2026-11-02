import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, UserRoundPlus } from "lucide-react";
import { z } from "zod";
import {
  inviteStaffMember,
  listAccessAccounts,
  listPeople,
  listScopedSites,
  setGrantActive,
} from "@/modules/identity/admin.functions";
import { WorkspaceShell, QueryState } from "@/components/workspace";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";
import { launchStaffInvitationDefaults } from "@/domain/launch-staff-invitation";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useZodForm } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): {siteId?: string; inviteRole?: string} => ({
    siteId: typeof search.siteId === "string" ? search.siteId : undefined,
    inviteRole: search.inviteRole === "registrar" || search.inviteRole === "site_website_editor" ? search.inviteRole : undefined,
  }),
  component: AdminConsolePage,
});

const roles = localStaffInviteRoles;

const inviteSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(roles),
  siteId: z.string().uuid("Choose a school site."),
});

const inviteDefaults: z.input<typeof inviteSchema> = {
  email: "",
  firstName: "",
  lastName: "",
  role: "teacher",
  siteId: "",
};

type Site = Awaited<ReturnType<typeof listScopedSites>>["sites"][number];
type Account = Awaited<ReturnType<typeof listAccessAccounts>>["accounts"][number];
type Person = Awaited<ReturnType<typeof listPeople>>["people"][number];

const authMessage = "Sign in with an authorized registrar account to manage access.";

function AdminConsolePage() {
  const selection = Route.useSearch();
  return <ScopedAdminConsole key={JSON.stringify(selection)} selection={selection}/>;
}

function ScopedAdminConsole({selection}: {selection: {siteId?: string; inviteRole?: string}}) {
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");

  const form = useZodForm(inviteSchema, { defaultValues: inviteDefaults });

  useEffect(() => {
    let active = true;
    Promise.all([listScopedSites(), listAccessAccounts(), listPeople({ data: {} })])
      .then(([siteResult, accountResult, peopleResult]) => {
        if (!active) return;
        setSites(siteResult.sites);
        const defaults = launchStaffInvitationDefaults(siteResult.sites, selection);
        form.setValue("siteId", defaults.siteId);
        form.setValue("role", defaults.role);
        if (defaults.unavailable) setError("The requested school is outside your available Sites. Choose a permitted school before inviting anyone.");
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

  async function submitInvite(values: z.output<typeof inviteSchema>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await inviteStaffMember({
        data: {
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          role: values.role,
          siteId: values.siteId,
        },
      });
      setNotice(!result.pending
        ? `${values.email} already has an active grant; no new invitation was sent.`
        : result.emailSent
          ? `Invitation emailed to ${values.email}. Their exact-site role stays inactive until they accept the secure link.`
          : `Invitation recorded for ${values.email}, but email delivery was not confirmed. Retry the same invitation; no duplicate grant will be created.`);
      const defaults = launchStaffInvitationDefaults(sites, selection);
      form.reset({...inviteDefaults,siteId:defaults.siteId,role:defaults.role});
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
      setError("Unable to update this grant. Check your authorized school scope and active grant.");
    }
  }

  const fieldClass = "mt-2 w-full rounded-lg border bg-background p-3";

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Admin"
      title="Admin console"
      subtitle="Invite staff, manage access accounts, and browse the people directory for your organizations."
    >
      <QueryState loading={loading ? "Loading admin console…" : ""} error={authError}>
        <WorkflowIntro eyebrow="Identity & access" title="The right people. The right access." description="Invite church-local staff to one exact Site. Secure email acceptance activates only the intended local role; CAN institutional appointments remain separate." actions={<><a href="#invite-staff" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><UserRoundPlus className="size-4" /> Invite staff</a><a href="#access-accounts" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"><KeyRound className="size-4" /> Review readiness</a></>} />
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {notice && <p className="mt-8 rounded-lg border bg-muted p-4 text-sm" role="status">{notice}</p>}

        <section id="invite-staff" className="mt-8 rounded-2xl border border-border/70 bg-card p-6 shadow-sm"><h2 className="font-serif text-2xl font-semibold">Invite staff</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create the person and an inactive exact-Site grant, then email the canonical secure access link. Accepting it establishes the intended local identity and role.</p>
           <p className="mt-1 text-xs text-muted-foreground">Onsite safeguarding roles are site-bound. Restricted intake is implemented but has not completed legal review or operational acceptance; continue to use approved external reporting and emergency procedures.</p>
          <Form {...form}>
            <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(submitInvite)}>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Email</FormLabel>
                  <FormControl>
                    <Input className={fieldClass} type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Role</FormLabel>
                  <FormControl>
                    <select className={`${fieldClass} capitalize`} {...field}>
                      {roles.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
                    </select>
                  </FormControl>
                  {field.value === "site_website_editor" && <p className="mt-2 text-xs text-muted-foreground">
                    After secure email acceptance, this publisher can edit only church-owned website copy,
                    branding and approved artwork at the selected Site. It grants no registrar, student-record,
                    academic approval, institutional publication or administrator access.
                  </p>}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">First name</FormLabel>
                  <FormControl>
                    <Input className={fieldClass} maxLength={80} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Last name</FormLabel>
                  <FormControl>
                    <Input className={fieldClass} maxLength={80} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="siteId" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-sm font-semibold">Exact Site (required)</FormLabel>
                  <FormControl>
                    <select className={fieldClass} required {...field}>
                      <option value="">Select a permitted school</option>
                      {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="sm:col-span-2">
                <button className="rounded-lg border bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={busy||!form.watch("siteId")}>
                  {busy ? "Inviting…" : "Invite staff member"}
                </button>
              </div>
            </form>
          </Form>
        </section>

        <section id="access-accounts" className="mt-8 rounded-2xl border border-border/70 bg-card p-6 shadow-sm"><h2 className="font-serif text-2xl font-semibold">Staff access and readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acceptance and qualification are separate facts. Onsite directors, facilitators and staff submit screening and safeguarding-training evidence through their Profile; an independent reviewer must approve both.</p>
          {accounts.length === 0 && <p className="mt-4 text-sm">No access accounts found in your organization scope.</p>}
          {accounts.length > 0 && <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs uppercase tracking-wide">
                  <TableHead className="pr-4">Email</TableHead>
                  <TableHead className="pr-4">Person</TableHead>
                  <TableHead className="pr-4">Role</TableHead>
                  <TableHead className="pr-4">Readiness</TableHead>
                  <TableHead className="pr-4">Still needs action</TableHead>
                  <TableHead>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.flatMap(account => account.grants.map(grant =>
                  <TableRow key={grant.grantId}>
                    <TableCell className="pr-4">{account.email}{account.disabled ? " (disabled)" : ""}</TableCell>
                    <TableCell className="pr-4">{grant.personName}</TableCell>
                    <TableCell className="pr-4 capitalize">{grant.role}</TableCell>
                    <TableCell className="pr-4">
                      <span className="rounded-full border px-3 py-1 text-xs">{{
                        invited: "Invitation sent", accepted: "Accepted", qualified: "Accepted · qualified",
                        needs_action: "Accepted · needs qualifications", inactive: "Inactive",
                      }[grant.onboarding.status]}</span>
                    </TableCell>
                    <TableCell className="pr-4 text-xs">{{
                      accept_invitation: "Recipient accepts email link",
                      submit_qualifications: "Staff submit screening and training",
                      await_qualification_review: "Independent qualification review or current evidence",
                      restore_access: "Access is disabled",
                      none: "None for this onboarding check",
                    }[grant.onboarding.nextAction]}</TableCell>
                    <TableCell>
                      {grant.onboarding.status !== "invited" && <button className="rounded-lg border px-3 py-1 text-xs font-semibold" type="button" onClick={() => toggleGrant(grant.grantId, grant.active)}>
                        {grant.active ? "Deactivate" : "Activate"}
                      </button>}
                    </TableCell>
                  </TableRow>,
                ))}
              </TableBody>
            </Table>
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
                  <li key={grant.grantId} className="capitalize">{grant.role} · {grant.accountEmail} · {grant.active ? "active" : "inactive"}</li>,
                )}
              </ul>}
            </article>)}
          </div>}
        </section>
      </QueryState>
    </WorkspaceShell>
  );
}
