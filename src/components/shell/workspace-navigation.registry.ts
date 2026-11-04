export interface WorkspaceNavigationItem {
  title: string;
  path: string;
  icon: "home" | "building" | "globe" | "book" | "calendar" | "clipboard" | "support" | "messages" | "safety" | "users";
  owns?: readonly string[];
}

export const workspaceHome = {
  site_website_editor: "/home",
  room_facilitator: "/home",
  site_staff: "/home",
  site_leader: "/home",
  paraeducator: "/home",
  safeguarding_responder: "/home",
  safeguarding_lead: "/home",
  student: "/home",
  guardian: "/home",
  teacher: "/home",
  registrar: "/home",
  site_admin: "/home",
  specialist: "/home",
  counselor: "/home",
  network_admin: "/home",
  can_network_steward: "/home",
} as const;

export type WorkspaceRole = keyof typeof workspaceHome;

const schoolAdministrationLinks = [
  { title: "Home", path: "/home", icon: "home",
    owns: ["/operations/launch", "/operations/launch/$programId", "/operations/workflows",
      "/operations/insights", "/operations/course-policies", "/operations/course-requests",
      "/operations/family-alerts", "/operations/field-trips", "/operations/health-review", "/operations/transfer-records", "/readiness",
      // Site Today is the daily drill-in from Home, not a separate destination.
      "/sites/$siteId"] },
  { title: "Admissions", path: "/admissions", icon: "clipboard", owns: ["/admissions/*"] },
  { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
  { title: "School profile", path: "/sites", icon: "building",
    owns: ["/sites/$siteId/profile", "/sites/$siteId/publish", "/sites/$siteId/parent-information"] },
  { title: "School years", path: "/operations/school-years", icon: "calendar" },
  { title: "Curriculum", path: "/operations/curriculum", icon: "book", owns: ["/operations/curriculum-marketplace"] },
  { title: "Teachers", path: "/operations/teacher-marketplace", icon: "users" },
  { title: "Administration", path: "/admin", icon: "users" },
] satisfies readonly WorkspaceNavigationItem[];

/**
 * Role-specific destinations. Do not list the role home here: `workspaceLinks`
 * prepends one generated "Home" item and ensures every role has Messages.
 */
const roleLinks = {
  site_admin: schoolAdministrationLinks,
  site_website_editor: [{ title: "Website", path: "/site-website", icon: "globe" }],
  room_facilitator: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Home", path: "/home", icon: "home" },
    { title: "Attendance", path: "/staff/attendance", icon: "clipboard" },
  ],
  site_staff: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Home", path: "/home", icon: "home", owns: ["/sites/$siteId"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  site_leader: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Home", path: "/home", icon: "home", owns: ["/sites/$siteId"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Staff", path: "/staff/teachers", icon: "users" },
    { title: "Schedule", path: "/calendar", icon: "calendar" },
    { title: "Attendance", path: "/staff/attendance", icon: "clipboard" },
    { title: "Community", path: "/site-website", icon: "globe", owns: ["/sites/$siteId/publish"] },
    { title: "Operations", path: "/operations/workflows", icon: "clipboard", owns: ["/operations/*"] },
  ],
  paraeducator: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "My profile", path: "/profiles", icon: "users" },
  ],
  safeguarding_responder: [{ title: "Assigned safeguarding", path: "/safeguarding", icon: "safety" }],
  safeguarding_lead: [{ title: "Assigned safeguarding", path: "/safeguarding", icon: "safety" }],
  network_admin: [
    { title: "Home", path: "/home", icon: "home" },
    { title: "Operations", path: "/operations/workflows", icon: "clipboard", owns: ["/operations/*"] },
  ],
  can_network_steward: [
    { title: "Home", path: "/home", icon: "home" },
    { title: "Jurisdiction profiles", path: "/operations/jurisdiction-profiles", icon: "clipboard" },
  ],
  student: [
    { title: "Home", path: "/home", icon: "home", owns: ["/student/settings"] },
    { title: "Learn", path: "/student/courses", icon: "book",
      owns: ["/student/courses/*", "/classes", "/student/assignments", "/student/discussions", "/student/study-groups", "/groups"] },
    { title: "My School", path: "/student/my-school", icon: "users", owns: ["/student/experiences", "/student/report-card"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
    { title: "Support", path: "/student/support", icon: "support", owns: ["/support"] },
  ],
  guardian: [
    { title: "Home", path: "/home", icon: "home",
      owns: ["/guardian/apply", "/guardian/admission-offers", "/guardian/enrollment-changes"] },
    { title: "Children & academics", path: "/guardian/academics", icon: "book",
      owns: ["/guardian/attendance", "/guardian/course-approvals", "/guardian/report-cards", "/guardian/watching"] },
    { title: "School", path: "/guardian/experiences", icon: "users",
      owns: ["/guardian/field-trips", "/guardian/group-permissions", "/guardian/study-group-consent", "/guardian/enrichment", "/guardian/health"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  teacher: [
    { title: "Home", path: "/home", icon: "home", owns: ["/teacher/notices"] },
    { title: "Classes", path: "/classes", icon: "book", owns: ["/teacher/discussions", "/teacher/study-groups", "/groups"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Gradebook", path: "/teacher/gradebook", icon: "clipboard", owns: ["/teacher/gradebook/*", "/teacher/missing-work"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  registrar: schoolAdministrationLinks,
  specialist: [
    { title: "Home", path: "/home", icon: "home" },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  counselor: [
    { title: "Home", path: "/home", icon: "home" },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
} satisfies Record<WorkspaceRole, readonly WorkspaceNavigationItem[]>;

export const workspaceHomeTitle = "Home";

function withHome(role: WorkspaceRole, links: readonly WorkspaceNavigationItem[]): readonly WorkspaceNavigationItem[] {
  const path = workspaceHome[role];
  const owns = links.filter(item => item.path === path).flatMap(item => item.owns ?? []);
  const home: WorkspaceNavigationItem = { title: workspaceHomeTitle, path, icon: "home", ...(owns.length ? { owns } : {}) };
  const destinations = links.filter(item => item.path !== path);
  const messages: WorkspaceNavigationItem = { title: "Messages", path: "/messages", icon: "messages" };
  return [home, ...destinations, ...(destinations.some(item => item.path === messages.path) ? [] : [messages])];
}

export const workspaceLinks = Object.fromEntries(
  (Object.keys(roleLinks) as WorkspaceRole[]).map(role => [role, withHome(role, roleLinks[role])]),
) as Record<WorkspaceRole, readonly WorkspaceNavigationItem[]>;

export function getWorkspaceHome(role: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(workspaceHome, role)
    ? workspaceHome[role as WorkspaceRole]
    : undefined;
}

export function getWorkspaceLinks(role: string): readonly WorkspaceNavigationItem[] | undefined {
  return Object.prototype.hasOwnProperty.call(workspaceLinks, role)
    ? workspaceLinks[role as WorkspaceRole]
    : undefined;
}

export function getActiveWorkspacePath(
  links: readonly WorkspaceNavigationItem[],
  pathname: string,
): string | undefined {
  const segments = pathname.replace(/\/$/, "").split("/");
  const exact = links.find(item => item.path === segments.join("/"));
  if (exact) return exact.path;
  return links.find(item => item.owns?.some(pattern => {
    const parts = pattern.split("/");
    const subtree = parts.at(-1) === "*";
    const expected = subtree ? parts.slice(0, -1) : parts;
    if (subtree ? segments.length <= expected.length : segments.length !== expected.length) return false;
    return expected.every((part, index) => part.startsWith("$")
      ? Boolean(segments[index]) : part === segments[index]);
  }))?.path;
}

export function isFocusedClassroomRoute(pathname: string, searchStr: string, role: string | null): boolean {
  const search = new URLSearchParams(searchStr);
  if (!search.has("section")) return false;
  if (pathname === "/classes") return role === "student" || role === "guardian" || role === "teacher";
  return pathname === "/student/courses" && search.get("view") !== "catalog" && role === "student";
}
