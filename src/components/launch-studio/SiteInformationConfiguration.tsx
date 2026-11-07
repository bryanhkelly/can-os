import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { siteInformationContexts, siteInformationSchema } from "@/domain/site-setup-configuration";
import { updateLaunchSiteInformation } from "@/modules/programs/site-configuration.functions";
import type { SchoolHubOptions } from "./SchoolLaunchHub";

const contextLabels: Record<typeof siteInformationContexts[number], string> = {
  church: "Church or faith community",
  microschool: "Microschool",
  homeschool: "Homeschool or cooperative",
  independent_school: "Independent school",
  other: "Other",
};

const emptyInformation = { contexts: [] as string[], hostChurchName: "", currentWebsiteUrl: "", otherContext: "" };

export function SiteInformationConfiguration({ site }: { site: SchoolHubOptions["sites"][number] }) {
  const router = useRouter();
  const [initial] = useState(() => {
    const parsed = siteInformationSchema.safeParse(site.siteInformationDraft);
    return parsed.success ? parsed.data : emptyInformation;
  });
  const [information, setInformation] = useState(initial);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const mutation = useWorkspaceMutation({ mutationFn: updateLaunchSiteInformation,
    invalidateRouter: () => router.invalidate() });

  async function save() {
    setNotice("");
    setError("");
    const parsed = siteInformationSchema.safeParse(information);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check Site information and try again.");
      return;
    }
    try {
      const result = await mutation.submit({ data: {
        siteId: site.id, expectedRevision: site.updatedAt, information: parsed.data,
      } });
      if (result.status === "ignored") return;
      if (result.refreshError) {
        setError("The information was saved, but the latest Site record could not be refreshed.");
        return;
      }
      setNotice("Site information saved. It has not been independently verified or published.");
    } catch (cause) {
      setError(mutationErrorMessage(cause, "Unable to save Site information. Refresh and retry."));
    }
  }

  return <section className="mt-6 max-w-3xl space-y-5" aria-label="Site Information">
    <fieldset className="space-y-3 border bg-card p-5">
      <legend className="px-2 text-sm font-semibold">What describes this school or its setting?</legend>
      <p className="text-sm text-muted-foreground">Select all that apply. These descriptions do not establish legal status, school authority, or a verified organization relationship.</p>
      {siteInformationContexts.map(context => <label key={context} className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={information.contexts.includes(context)}
          onChange={event => setInformation(current => ({
            ...current,
            contexts: event.target.checked
              ? [...current.contexts, context]
              : current.contexts.filter(value => value !== context),
          }))} />
        {contextLabels[context]}
      </label>)}
    </fieldset>
    <div className="space-y-4 border bg-card p-5">
      <Field label="Host church or community name (optional)">
        <Input maxLength={160} value={information.hostChurchName}
          onChange={event => setInformation(current => ({ ...current, hostChurchName: event.target.value }))} />
      </Field>
      <Field label="Current website (optional)" description="A private reference for Website Studio; it is not imported automatically.">
        <Input type="url" maxLength={2048} placeholder="https://…" value={information.currentWebsiteUrl}
          onChange={event => setInformation(current => ({ ...current, currentWebsiteUrl: event.target.value }))} />
      </Field>
      <Field label="Other Site context (optional)">
        <Textarea rows={4} maxLength={1000} value={information.otherContext}
          onChange={event => setInformation(current => ({ ...current, otherContext: event.target.value }))} />
      </Field>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="border bg-card p-4 text-sm">{notice}</p>}
    <Button type="button" disabled={mutation.isSubmitting || Boolean(mutation.refreshError)} onClick={() => void save()}>
      {mutation.isSubmitting ? "Saving…" : "Save Site information"}
    </Button>
    {mutation.refreshError && <Button variant="outline" disabled={mutation.isSubmitting}
      onClick={() => void mutation.retryRefresh()}>Retry saved information refresh</Button>}
  </section>;
}