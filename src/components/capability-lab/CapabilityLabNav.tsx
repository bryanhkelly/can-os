import { DetailNavigation, SectionTab } from "@/components/workspace";

export function CapabilityLabNav({ current, surveyDraftEnabled = false, surveyPublicationEnabled = false }: {
  current: "index" | "enrollment" | "noncredit" | "surveys" | "credentials" | "deployments" | "readiness" | "site-qualification" | "survey-drafts" | "survey-publications" | "facilitated" | "impact" | "devices";
  surveyDraftEnabled?: boolean;
  surveyPublicationEnabled?: boolean;
}) {
  return <DetailNavigation label="Capability Lab sections" variant="record">
    <SectionTab current={current === "index"} link={{to:"/canonical/capability-lab"}}>Overview</SectionTab>
    <SectionTab current={current === "deployments"} link={{to:"/canonical/lab/deployments"}}>Deployments</SectionTab>
    <SectionTab current={current === "site-qualification"} link={{to:"/canonical/lab/site-qualification"}}>Site qualification</SectionTab>
    <SectionTab current={current === "readiness"} link={{to:"/canonical/lab/readiness"}}>Assessment catalog</SectionTab>
    <SectionTab current={current === "facilitated"} link={{to:"/canonical/lab/facilitated"}}>Facilitated delivery</SectionTab>
    <SectionTab current={current === "impact"} link={{to:"/canonical/lab/impact"}}>Participation evidence</SectionTab>
    <SectionTab current={current === "devices"} link={{to:"/canonical/lab/devices"}}>Site devices</SectionTab>
    <SectionTab current={current === "enrollment"} link={{to:"/canonical/lab/enrollment"}}>Enrollment</SectionTab>
    <SectionTab current={current === "noncredit"} link={{to:"/canonical/lab/noncredit"}}>Noncredit testing</SectionTab>
    <SectionTab current={current === "credentials"} link={{to:"/canonical/lab/credentials"}}>Credential previews</SectionTab>
    {(surveyDraftEnabled || current === "survey-drafts") &&
      <SectionTab current={current === "survey-drafts"} link={{to:"/canonical/lab/survey-drafts"}}>Survey drafts</SectionTab>}
    {(surveyPublicationEnabled || current === "survey-publications") &&
      <SectionTab current={current === "survey-publications"} link={{to:"/canonical/lab/survey-publications"}}>Survey publication</SectionTab>}
    <SectionTab current={current === "surveys"} link={{to:"/canonical/lab/surveys"}}>Survey inspection</SectionTab>
  </DetailNavigation>;
}
