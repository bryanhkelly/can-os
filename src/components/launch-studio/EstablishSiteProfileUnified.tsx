import { SiteGuideV61 } from "./SiteGuideV61";
/**
 * CAN OS V6.1 · Shape / Site Profile.
 * One presentation, one canonical Site, three existing governed commands.
 * The commands are deliberately sequential and not an atomic transaction.
 */
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LaunchSiteAddressFields } from "@/components/operations/LaunchSiteAddressFields";
import { SiteTimezoneField } from "@/components/workspace/SiteTimezoneField";
import { ActionFooter, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
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
  onSaveAndExit: () => Promise<void>;
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
  const [saving, setSaving] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const draft = { name, timezone, contact, address, hasAddress };
  const identityChanged = name.trim() !== original.name || timezone !== original.timezone;
  const contactChanged = JSON.stringify(contact) !== JSON.stringify(original.contact);
  const addressChanged = hasAddress !== original.hasAddress ||
    hasAddress && JSON.stringify(address) !== JSON.stringify(original.address);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const releaseNavigation = useLaunchUnsavedChanges(dirty);
  const organization = organizations.find(item => item.id === site.organizationId);

  async function saveAndNavigate(navigate: () => void | Promise<void>) {
    if (busy.current || reloadRequired) return;
    setError("");
    if (name.trim().length < 2 || name.trim().length > 160 ||
        !siteTimezoneSchema.safeParse(timezone).success) {
      setError("Provide a valid Site name and time zone.");
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
    busy.current = true;
    setSaving(true);
    const operations: Array<(revision: string) => Promise<{revision: string}>> = [];
    if (identityChanged) {
      operations.push(revision => updateLaunchSiteIdentity({ data: {
        siteId: site.id, expectedRevision: revision,
        name: name.trim(), timezone,
      } }));
    }
    if (contactChanged) {
      operations.push(revision => updateLaunchSiteContact({ data: {
        siteId: site.id, expectedRevision: revision,
        contact: hasContact && validContact?.success ? validContact.data : null,
      } }));
    }
    if (addressChanged) {
      operations.push(revision => updateLaunchSiteAddress({ data: {
        siteId: site.id, expectedRevision: revision,
        address: hasAddress && validAddress?.success ? validAddress.data : null,
      } }));
    }
    let mutationsSucceeded = false;
    try {
      await saveSiteProfileSequentially(site.updatedAt, operations);
      mutationsSucceeded = true;
      // Even with no changes, read the currently authorized Site before handoff.
      await router.invalidate();
      releaseNavigation();
      try { await navigate(); }
      catch (failure) {
        setError(failure instanceof Error ? failure.message :
          "Your changes were saved, but we could not open your Site Workspace. Try again from the navigation.");
      }
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
    setHasAddress(checked);
    if (!checked) setAddress(original.address);
  }

  return <section aria-label="Site Profile" className="min-w-0 space-y-4">
    <form className="space-y-4" onSubmit={submit} noValidate aria-busy={saving}>
      <WorkspacePanel title="Site essentials">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Site name" required>
            <Input value={name} minLength={2} maxLength={160} disabled={saving || reloadRequired}
              onChange={event => setName(event.target.value)} />
          </Field>
          <SiteTimezoneField label="Site time zone" value={timezone} onChange={setTimezone}
            disabled={saving || reloadRequired} />
        </div>
        <dl className="mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Responsible organization</dt>
            <dd className="mt-1 font-medium">{organization?.name ?? "Organization unavailable"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Verified administrator</dt>
            <dd className="mt-1 font-medium">{administrator?.name ?? "Administrator identity unavailable in this view"}</dd>
            {administrator && <dd className="mt-1 break-all text-xs text-muted-foreground">{administrator.email}</dd>}
          </div>
        </dl>
      </WorkspacePanel>
      <WorkspacePanel title="Site contact (optional)">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact name or office">
            <Input value={contact.displayName} maxLength={160} disabled={saving || reloadRequired}
              onChange={event => setContact(current => ({...current, displayName: event.target.value}))} />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={contact.email} maxLength={254} disabled={saving || reloadRequired}
              onChange={event => setContact(current => ({...current, email: event.target.value}))} />
          </Field>
          <Field label="Contact phone">
            <Input type="tel" value={contact.phone} maxLength={40} disabled={saving || reloadRequired}
              onChange={event => setContact(current => ({...current, phone: event.target.value}))} />
          </Field>
        </div>
      </WorkspacePanel>
      <WorkspacePanel title="Physical location (optional)">
        <Label className="flex min-h-11 items-start gap-3 text-sm">
          <Checkbox checked={hasAddress} disabled={saving || reloadRequired}
            onChange={event => toggleAddress(event.target.checked)} />
          <span><strong>Add a physical address</strong></span>
        </Label>
        {hasAddress && <div className="mt-5 space-y-5 border-t pt-5">
          <LaunchSiteAddressFields address={address} onChange={setAddress}
            disabled={saving || reloadRequired} />
        </div>}
      </WorkspacePanel>
      {error && <WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
      {reloadRequired && <Button type="button" variant="outline" onClick={() => window.location.reload()}>
        Reload Site to reconcile changes
      </Button>}
      <ActionFooter layout="step">
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

/** Keep the companion rail focused on the next setup section. */
export function EstablishSiteProfileGuidance() {
  return <SiteGuideV61 guide={{
    summary: "A Site is the community or program you are shaping. It may have a different name from the organization responsible for it.",
    insight: "Choose a name people will recognize. Include a physical address or contact details only when they are useful for this Site.",
    connection: "Your Site profile anchors the website, outreach, operations and future offerings without deciding what is approved to run.",
    next: "In Site Information, describe the Site's identity, its host and how people will participate.",
  }} />;
}
