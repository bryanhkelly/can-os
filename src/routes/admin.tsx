import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  inviteStaffMember,
  listAccessAccounts,
  listPeople,
  listScopedSites,
  setGrantActive,
} from "@/modules/identity/admin.functions";
import { WorkspaceShell, QueryState } from "@/components/workspace";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useZodForm } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(search),
  component: AdminConsolePage,
});

const roles = ["teacher", "registrar", "specialist", "counselor"] as const;

const inviteSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(roles),
  organizationId: z.string(),
  siteId: z.string(),
});

const inviteDefaults: z.input<typeof inviteSchema> = {
  email: "",
  firstName: "",
  lastName: "",
  role: "teacher",
  organizationId: "",
  siteId: "",
};

type Organization = Awaited<ReturnType<typeof listScopedSites>>["organizations"][number];
type Site = Awaited<ReturnType<typeof listScopedSites>>["sites"][number];
type Account = Awaited<ReturnType<typeof listAccessAccounts>>["accounts"][number];
type Person = Awaited<ReturnType<typeof listPeople>>["people"][number];

const authMessage = "Sign in with an authorized registrar account to manage access.";

function AdminConsolePage() {
  const selection = Route.useSearch();
  const [sites, setSites] = useState<Site[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [requireSiteSelection,setRequireSiteSelection]=useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [grantToSwitch, setGrantToSwitch] = useState<{grantId:string;organizationId:string;organizationName:string}|null>(null);

  const [query, setQuery] = useState("");

  const form = useZodForm(inviteSchema, { defaultValues: inviteDefaults });

  useEffect(() => {
    let active = true;
    Promise.all([listScopedSites(), listAccessAccounts(), listPeople({ data: {} })])
      .then(([siteResult, accountResult, peopleResult]) => {
        if (!active) return;
        setOrganizations(siteResult.organizations);
        setSites(siteResult.sites);
        setRequireSiteSelection(siteResult.requireSiteSelection);
        const initialOrganizationId = siteResult.organizations.some(
          organization => organization.id === selection.organizationId,
        )
          ? selection.organizationId!
          : siteResult.organizations[0]?.id ?? "";
        form.setValue("organizationId", initialOrganizationId);
        if(siteResult.requireSiteSelection&&siteResult.sites.length===1)
          form.setValue("siteId",siteResult.sites[0]?.id??"");
        setAccounts(accountResult.accounts);
        setPeople(peopleResult.people);
        setLoading(false);
      })
      .catch(() => {
        if (active) { setAuthError(authMessage); setLoading(false); }
      });
    return () => { active = false; };
  }, [selection.organizationId]);

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
          organizationId: values.organizationId || undefined,
          ...(values.siteId ? { siteId: values.siteId } : {}),
        },
      });
      setNotice(result.created
        ? `Access grant recorded for ${values.email} in ${result.organizationName}. This does not send email.`
        : `${values.email} already has this grant in ${result.organizationName}; no changes were made.`);
      setGrantToSwitch(result.active && result.isCurrentAccount && values.role === "registrar"
        ? { grantId: result.grantId, organizationId: result.organizationId, organizationName: result.organizationName }
        : null);
      form.reset({
        ...inviteDefaults,
        organizationId: values.organizationId,
        siteId: requireSiteSelection && sites.length === 1 ? sites[0]?.id ?? "" : "",
      });
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

  async function switchToGrantedOrganization() {
    if (!grantToSwitch) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/access/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId: grantToSwitch.grantId }),
      });
      if (!response.ok) throw new Error("Unable to switch to the newly granted Organization.");
      window.location.assign(`/organizations/${grantToSwitch.organizationId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to switch memberships.");
      setBusy(false);
    }
  }

  const fieldClass = "mt-2 w-full rounded-lg border bg-background p-3";
  const selectedOrganizationId = form.watch("organizationId");

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Admin"
      title="Admin console"
      subtitle="Invite staff, manage access accounts, and browse the people directory for your organizations."
    >
      <QueryState loading={loading ? "Loading admin console…" : ""} error={authError}>
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {notice && <p className="mt-8 rounded-lg border bg-muted p-4 text-sm" role="status">{notice}</p>}

        <section className="mt-8 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Invite staff</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create a person, access account, and explicit scoped Organization/Site grant. Creating an Organization does not grant access to it.</p>
          {grantToSwitch && <button type="button" disabled={busy} onClick={() => void switchToGrantedOrganization()}
            className="mt-4 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Switch to {grantToSwitch.organizationName} profile
          </button>}
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
                      {roles.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </FormControl>
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
              <FormField control={form.control} name="organizationId" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-sm font-semibold">Organization</FormLabel>
                  <FormControl>
                    <select className={fieldClass} {...field} onChange={event => {
                      field.onChange(event);
                      form.setValue("siteId", "");
                    }}>
                      <option value="">Select an authorized Organization</option>
                      {organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="siteId" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-sm font-semibold">Site {requireSiteSelection?"(required for your membership)":"(optional)"}</FormLabel>
                  <FormControl>
                    <select className={fieldClass} {...field}>
                      <option value="">{requireSiteSelection?"Select a permitted school":"Organization-wide"}</option>
                      {sites.filter(site => site.organizationId === selectedOrganizationId).map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="sm:col-span-2">
                <button className="rounded-lg border bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={busy||!form.watch("organizationId")||(requireSiteSelection&&!form.watch("siteId"))}>
                  {busy ? "Inviting…" : "Invite staff member"}
                </button>
              </div>
            </form>
          </Form>
        </section>

        <section className="mt-8 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Access accounts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Toggle individual grants to activate or deactivate access.</p>
          {accounts.length === 0 && <p className="mt-4 text-sm">No access accounts found in your organization scope.</p>}
          {accounts.length > 0 && <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs uppercase tracking-wide">
                  <TableHead className="pr-4">Email</TableHead>
                  <TableHead className="pr-4">Person</TableHead>
                  <TableHead className="pr-4">Role</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.flatMap(account => account.grants.map(grant =>
                  <TableRow key={grant.grantId}>
                    <TableCell className="pr-4">{account.email}{account.disabled ? " (disabled)" : ""}</TableCell>
                    <TableCell className="pr-4">{grant.personName}</TableCell>
                    <TableCell className="pr-4 capitalize">{grant.role}</TableCell>
                    <TableCell className="pr-4">
                      <span className="rounded-full border px-3 py-1 text-xs">{grant.active ? "Active" : "Inactive"}</span>
                    </TableCell>
                    <TableCell>
                      <button className="rounded-lg border px-3 py-1 text-xs font-semibold" type="button" onClick={() => toggleGrant(grant.grantId, grant.active)}>
                        {grant.active ? "Deactivate" : "Activate"}
                      </button>
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
