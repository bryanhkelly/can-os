/** Shared V6.1 Prepare navigation metadata. Requirements and readiness are not
 * defined here: each owning operational service determines those dynamically. */
export const prepareStageModulesV61 = [
  { id: "program-catalog", title: "Programs & Solutions", subtitle: "Find available learning experiences and their operating requirements." },
  { id: "facilities-resources", title: "Facilities & Resources", subtitle: "Confirm the spaces, equipment and technology you can provide." },
  { id: "invite-team", title: "Team & Responsibilities", subtitle: "Bring people into the right scoped roles and verify qualifications." },
  { id: "schedules-capacity", title: "Schedules & Capacity", subtitle: "Define dates, days, sessions, rooms and available seats." },
  { id: "funding-enrollment", title: "Funding & Enrollment", subtitle: "Prepare funding decisions, capacity and admissions rules." },
  { id: "opening-compliance", title: "Safety & Readiness", subtitle: "Collect evidence and request independent opening decisions." },
] as const;

export type PrepareStageModuleIdV61 = (typeof prepareStageModulesV61)[number]["id"];
