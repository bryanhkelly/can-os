/**
 * CAN OS V6.1 · Establish / Site Profile.
 * One presentation, one canonical Site, three existing governed commands.
 * The commands are deliberately sequential and not an atomic transaction.
 */
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LaunchSiteAddressFields } from "@/components/operations/LaunchSiteAddressFields";
import { SiteTimezoneField } from "@/components/workspace/SiteTimezoneField";
import { ActionFooter, StatusBadge, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";
import { saveSiteProfileSequentially, SiteProfileSaveError } from "./site-profile-persistence";
import {
  draftSiteContactSchema, physicalSiteAddressSchema, siteAddressEditorDraft,
  siteTimezoneSchema,
} from "@/domain/site-setup-configuration";
import {
  updateLaunchSiteAddress, updateLaunchSiteContact, updateLaunchSiteIdentity,
} from "@/modules/programs/site-configuration.functions";
import type { SchoolHubOptions } from "./SchoolLaunchHub";

type Site = SchoolHubOptions["sites"][number];
type Contact = { displayName: string; email: string; phone: string };

const blankContact = (): Contact => ({ displayName: "", email: "", phone: "" });
function readContact(value: unknown): Contact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return blankContact();
  const source = value as Record<string, unknown>;
  return {
    displayName: typeof source.displayName === "string" ? source.displayName : "",
    email: typeof source.email === "string" ? source.email : "",
    phone: typeof source.phone === "string" ? source.phone : "",
  };
}

export function EstablishSiteProfileUnified({
  site, organizations, administrator, onBackToOverview, onSaveAndExit,
  onContinueToSiteInformation,
}: {
  site: Site;
  organizations: SchoolHubOptions["organizations"];
  /** Only a server-authorized identity reader may populate this value. */
  administrator?: { name: string; email: string } | null;
  onBackToOverview: () => void;
  onSaveAndExit: () => void;
  onContinueToSiteInformation: () => void;
}) {
  const router = useRouter();
  const [original] = useState(() => {
    const address = siteAddressEditorDraft(site.address);
    return {
      name: site.name,
      timezone: site.timezone,
      contact: readContact(site.contactDraft),
      address,
      hasAddress: Boolean(address.street1 || address.postalCode),
    };
  });
  const [name, setName] = useState(original.name);
  const [timezone, setTimezone] = useState(original.timezone);
  const [contact, setContact] = useState(original.contact);
  const [address, setAddress] = useState(original.address);
  const [hasAddress, setHasAddress] = useState(original.hasAddress);
  const [identityReason, setIdentityReason] = useState("");
  const [locationReason, setLocationReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const draft = { name, timezone, contact, address, hasAddress };
  const identityChanged = name.trim() !== original.name || timezone !== original.timezone;
  const contactChanged = JSON.stringify(contact) !== JSON.stringify(original.contact);
  const addressChanged = hasAddress && (!original.hasAddress ||
    JSON.stringify(address) !== JSON.stringify(original.address));
  const dirty = JSON.stringify(draft) !== JSON.stringify(original) ||
    Boolean(identityReason || locationReason);
  const releaseNavigation = useLaunchUnsavedChanges(dirty);
  const organization = organizations.find(item => item.id === site.organizationId);

  async function saveAndNavigate(navigate: () => void) {
    if (busy.current || reloadRequired) return;
    setError("");
    if (name.trim().length < 2 || name.trim().length > 160 ||
        !siteTimezoneSchema.safeParse(timezone).success) {
      setError("Provide a valid Site name and time zone.");
      return;
    }
    if (identityChanged && (identityReason.trim().length < 5 || identityReason.trim().length > 1000)) {
      setError("Explain the Site name or time zone change (5–1000 characters).");
      return;
    }
    const hasContact = Boolean(contact.displayName.trim() || contact.email.trim() || contact.phone.trim());
    const validContact = hasContact ? draftSiteContactSchema.safeParse(contact) : null;
    if (validContact && !validContact.success) {
      setError(validContact.error.issues[0]?.message ?? "Check the Site contact details.");
      return;
    }
    const validAddress = hasAddress ? physicalSiteAddressSchema.safeParse(address) : null;
    if (validAddress && !validAddress.success) {
      setError(validAddress.error.issues[0]?.message ?? "Complete the physical address.");
      return;
    }
    if (addressChanged && (locationReason.trim().length < 5 || locationReason.trim().length > 1000)) {
      setError("Explain the location entry or change (5–1000 characters).");
      return;
    }
    busy.current = true;
    setSaving(true);
    const operations: Array<(revision: string) => Promise<{revision: string}>> = [];
    if (identityChanged) {
      operations.push(revision => updateLaunchSiteIdentity({ data: {
        siteId: site.id, expectedRevision: revision,
        name: name.trim(), timezone, changeReason: identityReason.trim(),
      } }));
    }
    if (contactChanged) {
      operations.push(revision => updateLaunchSiteContact({ data: {
        siteId: site.id, expectedRevision: revision,
        contact: hasContact && validContact?.success ? validContact.data : null,
      } }));
    }
    if (addressChanged && validAddress?.success) {
      operations.push(revision => updateLaunchSiteAddress({ data: {
        siteId: site.id, expectedRevision: revision,
        address: validAddress.data, changeReason: locationReason.trim(),
      } }));
    }
    let mutationsSucceeded = false;
    try {
      await saveSiteProfileSequentially(site.updatedAt, operations);
      mutationsSucceeded = true;
      // Even with no changes, read the currently authorized Site before handoff.
      await router.invalidate();
      releaseNavigation();
      navigate();
    } catch (cause) {
      setReloadRequired(true);
      setError(mutationsSucceeded
        ? "Your changes were submitted, but fresh Site information could not be loaded. Reload and review the saved values before continuing."
        : cause instanceof SiteProfileSaveError && cause.completed > 0
          ? "Some changes may have saved, but the full update did not finish. Reload the Site and review its values before retrying."
          : cause instanceof Error ? cause.message : "Site Profile could not be saved. Reload and retry.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveAndNavigate(onContinueToSiteInformation);
  }

  function toggleAddress(checked: boolean) {
    if (original.hasAddress) return; // address removal is a separate governed amendment
    setHasAddress(checked);
    if (!checked) {
      setAddress(original.address);
      setLocationReason("");
    }
  }

  return <section aria-label="Site Profile" className="min-w-0 space-y-4">
    <WorkspaceNotice tone="info">
      <strong>Your Site already exists.</strong> Confirm its identity and add contact or location
      details when available. This form does not approve your Site, publish its website or open enrollment.
    </WorkspaceNotice>
    <div className="flex flex-wrap gap-2" aria-label="Setup requirements">
      <StatusBadge tone="info">Identity on file</StatusBadge>
      <StatusBadge tone="neutral">Contact optional</StatusBadge>
      <StatusBadge tone="neutral">Physical address optional</StatusBadge>
    </div>
    <form className="space-y-4" onSubmit={submit} noValidate aria-busy={saving}>
      <WorkspacePanel title="Site identity" description="Confirm the information you provided when creating this Site.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Site name" required description="Your website's public branding is configured later.">
            <Input value={name} minLength={2} maxLength={160} disabled={saving || reloadRequired}
              onChange={event => setName(event.target.value)} />
          </Field>
          <SiteTimezoneField label="Site time zone" value={timezone} onChange={setTimezone}
            disabled={saving || reloadRequired} />
        </div>
        {identityChanged && <div className="mt-5">
          <Field label="Reason for changing the Site name or time zone" required>
            <Input value={identityReason} minLength={5} maxLength={1000} disabled={saving || reloadRequired}
              onChange={event => setIdentityReason(event.target.value)} />
          </Field>
        </div>}
        <dl className="mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Responsible organization</dt>
            <dd className="mt-1 font-medium">{organization?.name ?? "Organization unavailable"}</dd>
            <p className="mt-1 text-xs text-muted-foreground">Read-only. Host relationships belong in Site Information.</p>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Verified administrator</dt>
            <dd className="mt-1 font-medium">{administrator?.name ?? "Administrator identity unavailable in this view"}</dd>
            {administrator && <dd className="mt-1 break-all text-xs text-muted-foreground">{administrator.email}</dd>}
            <p className="mt-1 text-xs text-muted-foreground">Account access and Site contact are separate.</p>
          </div>
        </dl>
      </WorkspacePanel>
      <WorkspacePanel title="Site contact (optional)"
        description="Private contact information, not automatically published to the Site website.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact name or office" description="Required if any contact information is entered.">
            <Input value={contact.displayName} maxLength={160} disabled={saving || reloadRequired}
              onChange={event => setContact(current => ({...current, displayName: event.target.value}))} />
          </Field>
          <Field label="Contact email" description="May differ from the administrator login email.">
            <Input type="email" value={contact.email} maxLength={254} disabled={saving || reloadRequired}
              onChange={event => setContact(current => ({...current, email: event.target.value}))} />
          </Field>
          <Field label="Contact phone">
            <Input type="tel" value={contact.phone} maxLength={40} disabled={saving || reloadRequired}
              onChange={event => setContact(current => ({...current, phone: event.target.value}))} />
          </Field>
          <p className="border-l-2 bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            Publishing contact details requires a separate website review.
          </p>
        </div>
      </WorkspacePanel>
      <WorkspacePanel title="Physical location (optional)"
        description="Provide an address if you have identified your learning location.">
        <Label className="flex min-h-11 items-start gap-3 text-sm">
          <Checkbox checked={hasAddress} disabled={saving || reloadRequired || original.hasAddress}
            onChange={event => toggleAddress(event.target.checked)} />
          <span><strong>Add a physical address</strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              {original.hasAddress
                ? "Address already on file. Removing it requires a separate governed amendment."
                : "You can continue without an address. Later program requirements may need one."}
            </span>
          </span>
        </Label>
        {hasAddress && <div className="mt-5 space-y-5 border-t pt-5">
          <LaunchSiteAddressFields address={address} onChange={setAddress}
            disabled={saving || reloadRequired} />
          {addressChanged && <Field label="Reason for entering or changing this location" required>
            <Input value={locationReason} minLength={5} maxLength={1000} disabled={saving || reloadRequired}
              onChange={event => setLocationReason(event.target.value)} />
          </Field>}
          <p className="text-xs text-muted-foreground">Changes to published or approved locations may require independent review.</p>
        </div>}
      </WorkspacePanel>
      {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
      {reloadRequired && <Button type="button" variant="outline" onClick={() => window.location.reload()}>
        Reload Site to reconcile changes
      </Button>}
      <ActionFooter layout="inline" className="justify-between border-t border-border/60 pt-5">
        <Button type="button" variant="outline" disabled={saving || reloadRequired} onClick={onBackToOverview}>
          <ArrowLeft aria-hidden="true" /> Back to Overview
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={saving || reloadRequired}
            onClick={() => void saveAndNavigate(onSaveAndExit)}>Save &amp; Exit</Button>
          <Button type="submit" loading={saving} loadingLabel="Saving Site…" disabled={reloadRequired}>
            Save &amp; Continue <ArrowRight aria-hidden="true"/>
          </Button>
        </div>
      </ActionFooter>
    </form>
  </section>;
}

/** The right rail is composed by the Launch Site route, not by the form. */
export function EstablishSiteProfileGuidance() {
  return <div className="space-y-4">
    <WorkspacePanel title="Why this matters">
      <p className="text-sm leading-6 text-muted-foreground">
        Your Site identity connects the learning community, programs, website and operational workspace.
        You only create the Site once.
      </p>
      <p className="mt-4 border-t pt-4 text-sm leading-6 text-muted-foreground">
        Contact and location can be added later. Profile completion does not mean opening approval.
      </p>
    </WorkspacePanel>
    <WorkspacePanel title="What comes next?">
      <p className="text-sm leading-6 text-muted-foreground">
        Site Information covers hosting and organization, learning environment and network affiliation.
      </p>
    </WorkspacePanel>
    <WorkspacePanel title="Preview Website">
      <p className="text-sm leading-6 text-muted-foreground">
        Use Preview Website in the top bar for the saved, private design. Previewing does not publish or enable enrollment.
      </p>
    </WorkspacePanel>
    <div className="flex items-start gap-2 border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
      <ShieldCheck className="size-4 shrink-0" aria-hidden="true"/>
      Opening approval and enrollment release are separate decisions.
    </div>
  </div>;
}
