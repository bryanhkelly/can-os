/** Shared staff administration component for the standalone admin route and
 * V6.1 Launch Studio Prepare. All writes go through the original staff service. */
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RoomCoverageWorkspace } from "@/components/operations/RoomCoverageWorkspace";
import { personDisplayName } from "@/domain/person-name";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  inviteStaffMember, listAccessAccounts, listPeople, listScopedSites, setGrantActive,
} from "@/modules/identity/admin.functions";
import { CreateAction, DirectoryTable, WorkspaceShell, QueryState, secondaryActionClassName } from "@/components/workspace";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";
import { launchStaffInvitationDefaults } from "@/domain/launch-staff-invitation";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, useZodForm } from "@/components/ui/form";

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

const authMessage = "Sign in with an authorized Site administrator or registrar to manage access.";

export function ScopedAdminConsole({selection, mode="access", hubMode=false,
  includeRoomCoverage=true, lockedSiteId, onChanged}: {
  onChanged?:()=>Promise<unknown>;
  hubMode?:boolean;
  includeRoomCoverage?:boolean;
  /** In Launch Studio, do not offer a different Site in this form or staff list. */
  lockedSiteId?:string;
  selection: {siteId?: string; inviteRole?: string};
  mode?: "access"|"invite"|"people";
}) {
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
    Promise.all([listScopedSites(), mode==="access"?listAccessAccounts():Promise.resolve({accounts:[]}), mode==="people"?listPeople({ data: {} }):Promise.resolve({people:[]})])
      .then(([siteResult, accountResult, peopleResult]) => {
        if (!active) return;
        setSites(siteResult.sites);
        const defaults = launchStaffInvitationDefaults(siteResult.sites, selection);
        form.setValue("siteId", lockedSiteId ?? defaults.siteId);
        form.setValue("role", defaults.role);
        if (lockedSiteId && !siteResult.sites.some(site => site.id === lockedSiteId)) {
          setError("The requested Site is outside your current invitation authority.");
        } else if (defaults.unavailable) {
          setError("The requested school is outside your available Sites. Choose a permitted school before inviting anyone.");
        }
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
    if (authError || mode!=="people") return;
    let active = true;
    listPeople({ data: { ...(query.trim() ? { query: query.trim() } : {}) } })
      .then(result => { if (active) setPeople(result.people); })
      .catch(() => { if (active) setError("Unable to search the people directory."); });
    return () => { active = false; };
  }, [query, authError, mode]);

  async function refresh() {
    const [accountResult, peopleResult] = await Promise.all([
      mode==="access"?listAccessAccounts():Promise.resolve({accounts:[]}),
      mode==="people"?listPeople({ data: { ...(query.trim() ? { query: query.trim() } : {}) } }):Promise.resolve({people:[]}),
    ]);
    setAccounts(accountResult.accounts);
    setPeople(peopleResult.people);
  }

  async function submitInvite(values: z.output<typeof inviteSchema>) {
    if (lockedSiteId && (values.siteId !== lockedSiteId ||
        !sites.some(site => site.id === lockedSiteId))) {
      setError("This invitation must remain within your current Site.");
      return;
    }
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
        : "demoAccess" in result && result.demoAccess
          ? `Demo invitation recorded for ${values.email}. Sign in with code 000000 to accept the exact-school role; no email is sent.`
        : result.emailSent
          ? `Invitation submitted to the email provider for ${values.email}. Their exact-site role stays inactive until they accept the secure link.`
          : `Invitation recorded for ${values.email}, but email delivery was not confirmed. Retry the same invitation; no duplicate grant will be created.`);
      const defaults = launchStaffInvitationDefaults(sites, selection);
      form.reset({...inviteDefaults,siteId:lockedSiteId ?? defaults.siteId,role:defaults.role});
      await refresh();
      void onChanged?.().catch(()=>setError("Changes were saved, but the Hub summary could not refresh. Reopen the Hub before retrying."));
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
      void onChanged?.().catch(()=>setError("Changes were saved, but the Hub summary could not refresh. Reopen the Hub before retrying."));
    } catch {
      setError("Unable to update this grant. Check your authorized school scope and active grant.");
    }
  }

  const fieldClass = "mt-2 w-full  border bg-background p-3";

  return (
    <WorkspaceShell embedded={hubMode}
      eyebrow="Admin"
      title={mode==="invite"?"Invite staff":mode==="people"?"People directory":"Staff access"}
      breadcrumbs={!hubMode && mode!=="access"?<Link to="/admin" search={{siteId:selection.siteId}} className="underline">Administration</Link>:undefined}
      actions={!hubMode && <div className="flex flex-wrap gap-2">
        {mode!=="invite"&&<CreateAction><Link to="/admin/invite" search={{siteId:selection.siteId, inviteRole:selection.inviteRole}}>Invite staff</Link></CreateAction>}
        {mode!=="people"&&<Link to="/admin/people" search={{siteId:selection.siteId}} className={secondaryActionClassName}>People directory</Link>}
      </div>}
    >
      <QueryState loading={loading ? "Loading admin console…" : ""} error={authError}>
        {error && <p className="mt-8  border p-4 text-sm" role="alert">{error}</p>}
        {notice && <p className="mt-8  border bg-muted p-4 text-sm" role="status">{notice}</p>}

        {mode==="invite"&&<section id="invite-staff" className="mt-8"><h2 className="font-serif text-2xl font-semibold">Invitation details</h2>
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
                    <Select className={`${fieldClass} capitalize`} {...field}>
                      {roles.map(option => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
                    </Select>
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
                    <Select className={fieldClass} required {...field} disabled={busy || Boolean(lockedSiteId)}>
                      <option value="">Select a permitted school</option>
                      {sites.filter(site => !lockedSiteId || site.id === lockedSiteId)
                        .map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="sm:col-span-2">
                <Button variant="default" size="lg" type="submit"
                  disabled={busy || Boolean(lockedSiteId && !sites.some(site => site.id === lockedSiteId))}>
                  {busy ? "Inviting…" : "Invite staff member"}
                </Button>
              </div>
            </form>
          </Form>
        </section>}

        {mode==="access"&&<section id="access-accounts" className="mt-8"><h2 className="font-serif text-2xl font-semibold">Staff access and readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">Acceptance and qualification are separate facts. Onsite directors, facilitators and staff submit screening and safeguarding-training evidence through their Profile; an independent reviewer must approve both.</p>
          <DirectoryTable label="Staff access" caption="Account grants in your authorized organizational scope."
            rows={accounts.flatMap(account=>account.grants
              .filter(grant=>!lockedSiteId || grant.siteId===lockedSiteId)
              .map(grant=>({account,grant})))}
            rowKey={row=>row.grant.grantId}
            empty={<p className="p-4 text-sm text-muted-foreground">No access accounts found in your organization scope.</p>}
            columns={[
              {id:"email",title:"Email",render:({account})=><>{account.email}{account.disabled?" (disabled)":""}</>},
              {id:"person",title:"Person",render:({grant})=>grant.personName},
              {id:"role",title:"Role",render:({grant})=>grant.role},
              {id:"readiness",title:"Readiness",render:({grant})=>({
                invited:"Invitation sent",accepted:"Accepted",qualified:"Accepted · qualified",
                needs_action:"Accepted · needs qualifications",inactive:"Inactive",
              }[grant.onboarding.status])},
              {id:"next",title:"Still needs action",render:({grant})=>({
                accept_invitation:"Recipient accepts email link",
                submit_qualifications:"Staff submit screening and training",
                await_qualification_review:"Independent qualification review or current evidence",
                restore_access:"Access is disabled",
                none:"None for this onboarding check",
              }[grant.onboarding.nextAction])},
            ]}
            rowActions={[{id:"toggle-access",label:({grant})=>grant.active?"Deactivate":"Activate",
              allowed:({grant})=>grant.onboarding.status!=="invited",
              onClick:({grant})=>void toggleGrant(grant.grantId,grant.active)}]}/>
        </section>}

        {mode==="access"&&includeRoomCoverage&&form.watch("siteId") && <RoomCoverageWorkspace key={form.watch("siteId")} siteId={form.watch("siteId")}/>}
        {mode==="people"&&<section className="mt-8">
          <h2 className="text-lg font-semibold">People directory</h2>
          <Label className="mt-4 block max-w-sm text-sm font-semibold">
            Search
            <Input className="mt-2 w-full  border bg-background p-3" type="search" placeholder="Search by name" value={query} onChange={event => setQuery(event.target.value)} />
          </Label>
          <DirectoryTable label="People directory" caption="People in the authorized organizational scope."
            rows={people} rowKey={person=>person.personId}
            empty={<p className="p-4 text-sm text-muted-foreground">No people found.</p>}
            columns={[
              {id:"person",title:"Person",render:person=>personDisplayName({
                preferredName:person.preferredName,legalFirstName:person.firstName,legalLastName:person.lastName})},
              {id:"status",title:"Status",render:person=>person.active?"Active":"Inactive"},
              {id:"grants",title:"Grants",render:person=><ul className="space-y-1 text-sm">
                {person.grants.map(grant=><li key={grant.grantId}>{grant.role} · {grant.accountEmail} · {grant.active?"active":"inactive"}</li>)}
              </ul>},
            ]}/>
        </section>}
      </QueryState>
    </WorkspaceShell>
  );
}
