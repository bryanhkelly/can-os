import { z } from "zod";
/** Malformed or stale URL selections must return to the authorized school picker,
 * not throw from route validation before a loader can handle the error. */
export const schoolHubSearch = z.object({
  siteId:z.string().uuid().optional().catch(undefined),
  programId:z.string().uuid().optional().catch(undefined),
  teamMode:z.enum(["access","invite","people"]).optional().catch(undefined),
});
export const schoolHubModules = {
  website: { title: "Build Website", description: "Design, preview and publish your school's website.", action: "Open website setup", step: "website" },
  team: { title: "Invite Your Team", description: "Bring in school leaders and delegate scoped permissions.", action: "Invite team member" },
  promote: { title: "Promote Your School", description: "Prepare your media kit, social graphics, captions, flyers and QR codes." },
  recruitment: { title: "Recruit Families", description: "Gather prospective-family interest and plan your follow-up." },
  events: { title: "Interest Events", description: "Bring families together for information sessions, tours and open houses." },
  academics: { title: "Prepare Academics", description: "Configure Programs, curriculum and the school year.", action: "Open academic setup", step: "academics" },
  compliance: { title: "Opening & Compliance", description: "Prepare evidence and track independent opening reviews.", action: "Review opening requirements", step: "readiness" },
} as const;
export type SchoolHubModule = keyof typeof schoolHubModules;
export const plannedSchoolHubModules = ["promote", "recruitment", "events"] as const;
export type PlannedSchoolHubModule = typeof plannedSchoolHubModules[number];
export function isPlannedSchoolHubModule(module: SchoolHubModule): module is PlannedSchoolHubModule {
  return plannedSchoolHubModules.some(planned => planned === module);
}
export const schoolHubSections = [
  { title: "Establish Your School", description: "Give your school a home online.", modules: ["website"] },
  { title: "Build Your School Community", description: "Bring your team and prospective families into the vision.", modules: ["team", "promote", "recruitment", "events"] },
  { title: "Prepare to Open", description: "Prepare academics and work through independent opening requirements.", modules: ["academics", "compliance"] },
] as const;
