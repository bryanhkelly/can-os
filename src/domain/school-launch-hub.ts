import { z } from "zod";
/** Preserve caller-supplied identifiers so invalid links produce an explicit
 * recovery message instead of silently dropping their URL parameters.
 * Server readers verify UUID format, membership, Site and Program scope. */
export const schoolHubSearch = z.object({
  siteId:z.string().optional(),
  programId:z.string().optional(),
  teamMode:z.enum(["access","invite","people"]).optional(),
});
export const schoolHubModules = {
  profile: { title: "School details", description: "Set up your school's identity, location and first offering." },
  information: { title: "Site Information", description: "Describe the school setting and share its current website." },
  website: { title: "Website & Brand", description: "Choose a school identity, customize its brand, and build your hosted website.", action: "Open Website & Brand Studio", step: "website" },
  team: { title: "Invite Your Team", description: "Bring in school leaders and delegate scoped permissions.", action: "Invite team member" },
  promote: { title: "Promote Your School", description: "Prepare your media kit, social graphics, captions, flyers and QR codes." },
  recruitment: { title: "Recruit Families", description: "Gather prospective-family interest and plan your follow-up." },
  events: { title: "Interest Events", description: "Bring families together for information sessions, tours and open houses." },
  academics: { title: "Prepare Academics", description: "Set grades and a learning model, then choose curriculum.", action: "Start academic setup", step: "academics" },
  compliance: { title: "Opening & Compliance", description: "Prepare evidence and track independent opening reviews.", action: "Review opening requirements", step: "readiness" },
} as const;
export type SchoolHubModule = keyof typeof schoolHubModules;
export const plannedSchoolHubModules = ["promote", "recruitment", "events"] as const;
export type PlannedSchoolHubModule = typeof plannedSchoolHubModules[number];
export type OperationalSchoolHubModule = Exclude<SchoolHubModule, PlannedSchoolHubModule>;
export function isPlannedSchoolHubModule(module: SchoolHubModule): module is PlannedSchoolHubModule {
  return plannedSchoolHubModules.some(planned => planned === module);
}
export const schoolHubSections = [
  { title: "Establish Your School", description: "Set up your school details, site context and website.", modules: ["profile", "information", "website"] },
  { title: "Build Your School Community", description: "Bring your team and prospective families into the vision.", modules: ["team", "promote", "recruitment", "events"] },
  { title: "Prepare to Open", description: "Plan academics and complete independent opening requirements.", modules: ["academics", "compliance"] },
] as const;
