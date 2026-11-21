import type { MarketingPurpose } from "./marketing-package-v61";

/** One Outreach Plan surface and one library. Both reuse the single existing
 * Site-scoped, Brand-pinned Marketing Package lifecycle. */
export const introduceModuleIdsV61=["create-outreach","my-outreach"] as const;
export type IntroduceModuleV61=typeof introduceModuleIdsV61[number];
type Handoff={title:string;description:string;href:(siteId:string)=>string};
type Config={
  title:string;eyebrow:string;subtitle:string;libraryTitle:string;
  libraryDescription:string;guidance:string;defaultPurpose:MarketingPurpose;
  purposes:readonly MarketingPurpose[];handoffDescription:string;
  handoffs:readonly Handoff[];
};
const encode=(id:string)=>encodeURIComponent(id);
export const introduceModuleConfigV61:Record<IntroduceModuleV61,Config>={
  "create-outreach":{
    title:"Create Outreach",eyebrow:"Share / Create Outreach",
    subtitle:"Tell the right people about your vision and invite a meaningful next step.",
    libraryTitle:"Create Outreach",libraryDescription:"Start a guided outreach plan.",
    guidance:"Build on what you've shared about your community, then shape a message people will care about.",
    defaultPurpose:"site-announcement",
    purposes:["site-announcement","program-interest","interest-invitation","event-invitation"],
    handoffDescription:"Return to your saved outreach plans.",
    handoffs:[{title:"My Outreach",description:"Review drafts, materials, and follow-up.",
      href:id=>"/launch/site?siteId="+encode(id)+"&module=my-outreach"}],
  },
  "my-outreach":{
    title:"My Outreach",eyebrow:"Share / My Outreach",
    subtitle:"Review your saved plans and materials. Nothing is sent until you choose to share it.",
    libraryTitle:"My Outreach",libraryDescription:"Open, revise, duplicate, or archive an outreach plan.",
    guidance:"Find your outreach plans and earlier materials here. You can revisit or update them whenever you need.",
    defaultPurpose:"site-announcement",
    purposes:["site-announcement","program-interest","interest-invitation","event-invitation"],
    handoffDescription:"Start another outreach plan.",
    handoffs:[{title:"Create Outreach",description:"Create a new six-step outreach plan.",
      href:id=>"/launch/site?siteId="+encode(id)+"&module=create-outreach"}],
  },
};
export function isIntroduceModuleV61(value:string|undefined):value is IntroduceModuleV61{
  return value==="create-outreach"||value==="my-outreach";
}
