import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { expect, userEvent, within } from "storybook/test";
import { LaunchStudioChrome, LaunchStudioShell, JourneyWelcome } from "./LaunchStudioShell";
import { LaunchStudioEntry } from "./LaunchStudioEntry";
import { Button } from "@/components/ui/button";
import { LaunchConfigurationForm } from "@/components/operations/LaunchConfigurationForm";

const meta = {
  title: "Workflows/Launch Studio",
  parameters: { layout: "fullscreen" },
  decorators: [Story => {
    const router = createRouter({ routeTree: createRootRoute({ component: Story }),
      history: createMemoryHistory({ initialEntries: ["/launch"] }) });
    return <RouterProvider router={router} />;
  }],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const steps = [{ id: "welcome", title: "Welcome" }, { id: "details", title: "School details" },
  { id: "review", title: "Independent review" }];
function Journey({ state = "welcome" }: { state?: "welcome" | "pending" | "error" | "forbidden" | "empty" }) {
  const [step, setStep] = useState("welcome");
  return <LaunchStudioChrome><LaunchStudioShell role="School setup" subject="Isolated example school"
    title="Let's build your school." steps={steps} currentId={step} onStepChange={setStep}
    progress={state === "pending" ? { complete: 1, total: 4 } : undefined}
    actions={<Button onClick={() => setStep("details")}>Let's get started</Button>}
    exit={<a href="#dashboard">Skip to dashboard</a>}>
    {state === "welcome" ? <JourneyWelcome summary="An isolated layout fixture, not a real school."
      requirements={["School location and time zone", "Grade range and intended opening date"]}
      outcome="Saved preparation does not approve school opening." /> :
      <p role={state === "error" || state === "forbidden" ? "alert" : "status"} className="border bg-card p-6 text-sm">
        {{ pending: "Evidence received. Independent review is pending.", error: "School information is unavailable. Retry before continuing.",
          forbidden: "This school is unavailable to your verified account. No other school was selected.",
          empty: "No requirements have been configured. No completion percentage can be inferred." }[state]}
      </p>}
  </LaunchStudioShell></LaunchStudioChrome>;
}
export const Entry: Story = { render: () => <LaunchStudioChrome><LaunchStudioEntry /></LaunchStudioChrome> };
export const Welcome: Story = {
  render: () => <Journey />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Let's get started" }));
    const mobileNavigation = canvas.queryByRole("button", { name: /View steps/ });
    if (mobileNavigation) await userEvent.click(mobileNavigation);
    await expect(canvas.getByRole("button", { name: "2 School details" })).toHaveAttribute("aria-current", "step");
    await expect(canvas.queryByText("100%")).not.toBeInTheDocument();
  },
};
export const PendingReview: Story = { render: () => <Journey state="pending" /> };
export const Unavailable: Story = { render: () => <Journey state="error" /> };
export const Forbidden: Story = { render: () => <Journey state="forbidden" /> };
export const Unconfigured: Story = { render: () => <Journey state="empty" /> };

function SchoolDetails({ unsupported = false }: { unsupported?: boolean }) {
  const [name,setName]=useState("Example Academy");
  const [slug,setSlug]=useState("example-academy");
  const [slugEdited,setSlugEdited]=useState(false);
  const [type,setType]=useState<ComponentProps<typeof LaunchConfigurationForm>["identity"]["type"]>("full_school");
  const [date,setDate]=useState("2027-08-16");
  const [gradeMin,setGradeMin]=useState("K");
  const [gradeMax,setGradeMax]=useState("12");
  const [onsite,setOnsite]=useState(true);
  const [online,setOnline]=useState(false);
  const [selfPaced,setSelfPaced]=useState(false);
  const [days,setDays]=useState("5");
  const organization={id:"org",name:"Example School Organization",type:"christian_school"} as const;
  const options:ComponentProps<typeof LaunchConfigurationForm>["hostAndProvider"]["options"]={
    organizations:[organization],academicProviderOrganizations:[organization],creditIssuingOrganizations:[organization],
    canCreateSite: true, schoolSetupAdministrator:true,
    jurisdictions:[{id:"tx",code:"US-TX",name:"Texas"}],
    sites:[{id:"site",organizationId:"org",name:"Example Academy Campus",slug:"example-campus",
      timezone:"America/Chicago",updatedAt:"2026-11-05T00:00:00Z",
      address:{street1:"100 Example Lane",city:"Example City",state:unsupported?"CA":"TX",postalCode:"75001",country:"US"},
      addressStatus:"church_supplied",sitePhysicalAddressRevision:null,siteIdentityRevision:null,contactDraft:null,siteInformationDraft:null,websiteDraft:null}],
  };
  return <LaunchStudioChrome><LaunchStudioShell role="School setup" subject="Example Academy"
    title="Your school, your foundation." steps={steps} currentId="details" onStepChange={()=>{}}>
    <LaunchConfigurationForm created={null} hasSchoolPreparation={false} busy={false}
      modelPresets={{onSchoolModel:setType}}
      identity={{type,setType,summerCreditBearing:false,setSummerCreditBearing:()=>{},
        name,setName,targetOpeningDate:date,setTargetOpeningDate:setDate,slug,setSlug,slugEdited,setSlugEdited,
        gradeMin,setGradeMin,gradeMax,setGradeMax}}
      delivery={{onsite,setOnsite,liveOnline:online,setLiveOnline:setOnline,asynchronous:selfPaced,setAsynchronous:setSelfPaced,
        onsiteDaysPerWeek:days,setOnsiteDaysPerWeek:setDays}}
      hostAndProvider={{options,hostOrganizationId:"org",setHostOrganizationId:()=>{},siteId:"site",setSiteId:()=>{},
        hostSites:options.sites,setCreatedSiteDraft:()=>{},newSiteName:"",setNewSiteName:()=>{},newSiteSlug:"",setNewSiteSlug:()=>{},
        newSiteTimezone:"America/Chicago",setNewSiteTimezone:()=>{},
        newSiteAddress:{street1:"",street2:"",city:"",state:"",postalCode:"",country:"US",county:""},setNewSiteAddress:()=>{},
        saveSiteAddress:async()=>{},saveSiteContact:async()=>{},saveSiteIdentity:async()=>{},addSite:async()=>{},
        duplicateNewSite:undefined,createdSiteDraft:null,busy:false,jurisdictionId:unsupported?"":"tx",setJurisdictionId:()=>{},
        academicProviderOrganizationId:"org",setAcademicProviderOrganizationId:()=>{},creditIssuingOrganizationId:"org",
        setCreditIssuingOrganizationId:()=>{},creditMode:"credit_bearing",jurisdictionGuidance:{},jurisdictionResearch:{}}}
      submitLaunch={event=>event.preventDefault()} />
  </LaunchStudioShell></LaunchStudioChrome>;
}
export const SchoolForm: Story = {
  render:()=> <SchoolDetails />,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    const help=canvas.getByRole("button",{name:"About the offering short name"});
    help.focus();
    await expect(await canvas.findByRole("tooltip")).toHaveTextContent("This does not set or publish your website address");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.click(help);
    await expect(canvas.getByRole("tooltip")).toBeVisible();
    await userEvent.click(canvas.getByRole("textbox",{name:"School or offering name"}));
    await expect(canvas.queryByRole("tooltip")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button",{name:"Save and continue"})).toBeEnabled();
    const input=canvas.getByRole("textbox",{name:"School or offering name"});
    await expect(Number(getComputedStyle(input).fontWeight)).toBeGreaterThan(Number(getComputedStyle(input.closest("label")!).fontWeight));
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const UnsupportedSchoolState: Story = {
  render:()=> <SchoolDetails unsupported />,
  play:async({canvasElement})=>{
    const canvas=within(canvasElement);
    await expect(canvas.getAllByText(/School setup for California isn't available yet/).length).toBe(2);
    await expect(canvas.getByRole("combobox",{name:/State or region.*required/})).toHaveAttribute("aria-invalid","true");
    await expect(canvas.getByRole("button",{name:"Save and continue"})).toBeDisabled();
    await expect(canvas.getByRole("textbox",{name:"School or offering name"})).toHaveValue("Example Academy");
  },
};
