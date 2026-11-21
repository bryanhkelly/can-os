import type { SiteIdentityV61Draft } from "./site-identity-v61";
import { siteIdentityTypeOptionsV61 } from "./site-identity-v61";
import type { SiteHostingV61, SiteStoryV61 } from "./site-information-v61";
import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";
import { siteExperienceById } from "./site-experience-interests";
import type { SiteGuideContentV61 } from "@/components/launch-studio/SiteGuideV61";

type SiteInformationInputs = {
  siteType: SiteIdentityV61Draft["siteType"];
  hostingMode: SiteHostingV61["hostingMode"];
  delivery: "physical" | "digital" | "both" | "";
  values: SiteStoryV61["values"];
  networkChoice: "independent" | "request";
  planning?: SiteProgramsAudiencesV61 | null;
};

const audienceNames: Record<SiteProgramsAudiencesV61["audienceIds"][number], string> = {
  children: "Children", teens: "Teens", adults: "Adults", older_adults: "Older adults",
};
const interestNames: Record<SiteProgramsAudiencesV61["interestIds"][number], string> = {
  "grades-6-8": "Middle school", "grades-9-12": "High school",
  afterschool: "After-school", summer: "Summer", adult: "Adult learning", senior: "Older adults",
};
const storyIdeas: Record<SiteProgramsAudiencesV61["interestIds"][number], string> = {
  "grades-6-8": "middle school learning and enrichment",
  "grades-9-12": "high school learning and enrichment",
  afterschool: "after-school enrichment", summer: "summer experiences",
  adult: "practical learning", senior: "lifelong learning and connection",
};
const deliveryNames = { physical: "In person", digital: "Online", both: "In person and online" } as const;
const values: Record<SiteStoryV61["values"][number], string> = {
  belonging: "Belonging", curiosity: "Curiosity", excellence: "Excellence", integrity: "Integrity",
  creativity: "Creativity", service: "Service", opportunity: "Opportunity", family: "Family",
};

/** Visible draft choices only. No personal narratives or third-party identity are echoed. */
export function siteInformationGuideV61(step: 0 | 1 | 2 | 3, input: SiteInformationInputs): SiteGuideContentV61 {
  const kind = siteIdentityTypeOptionsV61.find(option => option.value === input.siteType)?.label ?? null;
  if (step === 0) return {
    summary: "A Site can have its own identity even when another organization hosts or operates it.",
    highlights: [kind, input.hostingMode === "same" ? "Hosted by your organization" :
      input.hostingMode === "different" ? "Different host planned" : null]
      .filter((value): value is string => Boolean(value)),
    insight: input.hostingMode === "different"
      ? "Describe the Site itself first. A hosting organization's name or legal status does not determine the Site's identity."
      : "Think about how a participant would describe this Site in one sentence. It may differ from the organization responsible for it.",
    connection: "This identity helps tailor your website prompts and outreach. It does not establish accreditation, affiliation or approval.",
  };
  if (step === 1) return {
    summary: "How people participate shapes the experience you can plan.",
    highlights: input.delivery ? [deliveryNames[input.delivery]] : [],
    insight: input.delivery === "digital"
      ? "For online experiences, think about devices, internet access and the help participants may need to connect."
      : input.delivery === "both"
        ? "For hybrid activities, consider what should work equally well for people on-site and joining remotely."
        : "Think about accessibility, capacity, equipment and how people will get to your space.",
    connection: "Prepare will connect the delivery approach to specific facilities, staffing and solution requirements.",
  };
  if (step === 2) return {
    summary: input.networkChoice === "request"
      ? "You are exploring a network relationship, not recording an approved affiliation."
      : "Your Site can continue independently.",
    insight: "A network may offer resources, shared programming or support. Ask what participants gain and what commitments the relationship requires.",
    connection: "Any network connection or approval is a separate decision from Site setup.",
  };
  const plannedAudience = input.planning?.audienceIds[0];
  const plannedProgram = input.planning?.interestIds[0];
  const storyExample = plannedAudience || plannedProgram
    ? `You might say: We hope to bring ${plannedProgram ? storyIdeas[plannedProgram] : "meaningful experiences"} to ${plannedAudience ? audienceNames[plannedAudience].toLowerCase() : "our community"}, ${input.values[0] ? "guided by a commitment to " + values[input.values[0]].toLowerCase() : "guided by our shared purpose"}. Make this your own.`
    : null;
  return {
    summary: kind ? `You're shaping the story of your ${kind.toLowerCase()}.` : "You're shaping the story of your community.",
    highlights: [
      ...input.values.slice(0, 2).map(value => values[value]),
      ...(plannedAudience ? [audienceNames[plannedAudience]] : []),
    ],
    insight: storyExample ?? (input.siteType === "church_community"
      ? "Try a concrete line such as: We hope to bring neighbors together through learning and service. Keep planned activities clearly described as future possibilities."
      : input.siteType === "training_workforce"
        ? "Try a specific line such as: We hope to help adults build practical digital skills for daily life and work. Adapt it to your actual vision."
        : "A useful story names the people, a real need and a hoped-for experience. Try: We hope to bring our community together through practical learning and connection."),
    connection: "With your permission, these answers can inform editable website and outreach suggestions. They will not be published automatically.",
  };
}

export function programsAudiencesGuideV61(
  step: 0 | 1 | 2,
  intent: SiteProgramsAudiencesV61,
  programs: readonly { code: string; title: string }[] = [],
  experienceStage: "choose" | "personalize" = "choose",
): SiteGuideContentV61 {
  const selected = (intent.programCodes ?? []).map(code => programs.find(item => item.code === code)?.title)
    .filter((value): value is string => Boolean(value));
  const interests = intent.interestIds.map(id => interestNames[id]);
  const audiences = intent.audienceIds.map(id => audienceNames[id]);
  const experiences = [
    ...(intent.experienceIds ?? []).map(id => siteExperienceById.get(id)?.title).filter((value): value is string => Boolean(value)),
    ...(intent.customExperiences ?? []),
  ];
  if (step === 0) return {
    summary: selected.length || interests.length
      ? "These are program ideas you are considering, not offerings currently open for registration."
      : "Begin with a broad idea. You can choose how to deliver it later.",
    highlights: [...selected, ...interests].slice(0, 3),
    insight: intent.interestIds.includes("senior") || intent.interestIds.includes("adult")
      ? "Consider both learning goals and the practical supports adult participants might need, such as scheduling and digital access."
      : "A Program is the big idea. In Prepare, a Solution defines the actual delivery, people, resources and requirements.",
    connection: "Your selections help you discover suitable Solutions in Prepare and shape what you share with your community.",
  };
  if (step === 1) return {
    summary: audiences.length ? "The people you hope to serve can guide what you offer and how you communicate it."
      : "Choose who you hope to serve. You can reach different people with different messages later.",
    highlights: audiences.slice(0, 3),
    insight: intent.audienceIds.includes("older_adults")
      ? "For older adults, also consider family caregivers, trusted local organizations and accessible ways to learn about an opportunity."
      : intent.audienceIds.includes("teens") || intent.audienceIds.includes("children")
        ? "Young people and the adults who support them may need different information about the same experience."
        : "Think about who will participate and who else might help them decide, attend or spread the word.",
    connection: "Share can suggest audience-specific outreach, without turning these choices into a contact list.",
  };
  return {
    summary: experiences.length
      ? `You're exploring ${experiences.length} experience${experiences.length === 1 ? "" : "s"} for your community.`
      : "Experiences make broad program ideas tangible.",
    highlights: experiences.slice(0, 3),
    insight: experienceStage === "personalize"
      ? "Make the featured experiences yours by choosing realistic activities and hoped-for outcomes. Keep them as aspirations until you have an approved Solution."
      : "Consider a small mix of practical skills, social connection and discovery. Start with the few experiences that best fit your audiences.",
    connection: "Featured experiences can inspire your website and outreach. Facilities, staffing and permissions are considered later in Prepare.",
  };
}
