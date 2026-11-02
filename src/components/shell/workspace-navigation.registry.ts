export interface WorkspaceNavigationItem {
  title: string;
  path: string;
  icon: "home" | "book" | "calendar" | "clipboard" | "support" | "messages" | "safety" | "users";
  owns?: readonly string[];
}

export const workspaceHome = {
  site_website_editor: "/site-website",
  room_facilitator: "/site/day",
  site_staff: "/site/day",
  site_leader: "/site/day",
  paraeducator: "/profiles",
  safeguarding_responder: "/safeguarding",
  safeguarding_lead: "/safeguarding",
  student: "/student",
  guardian: "/guardian",
  teacher: "/teacher",
  registrar: "/operations",
  specialist: "/coach",
  counselor: "/counselor",
  network_admin: "/network",
  can_network_steward: "/network-steward",
} as const;

export type WorkspaceRole = keyof typeof workspaceHome;

export const workspaceLinks = {
  site_website_editor: [{ title: "Website", path: "/site-website", icon: "home" }],
  room_facilitator: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Today", path: "/site/day", icon: "home" },
    { title: "Attendance", path: "/staff/attendance", icon: "clipboard" },
  ],
  site_staff: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Today", path: "/site/day", icon: "home", owns: ["/sites/$siteId"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  site_leader: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Today", path: "/site/day", icon: "home", owns: ["/sites/$siteId"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Staff", path: "/staff/teachers", icon: "users" },
    { title: "Schedule", path: "/calendar", icon: "calendar" },
    { title: "Attendance", path: "/staff/attendance", icon: "clipboard" },
    { title: "Community", path: "/site-website", icon: "home", owns: ["/sites/$siteId/publish"] },
    { title: "Operations", path: "/operations", icon: "clipboard", owns: ["/operations/*"] },
  ],
  paraeducator: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "My profile", path: "/profiles", icon: "users" },
  ],
  safeguarding_responder: [{ title: "Assigned safeguarding", path: "/safeguarding", icon: "safety" }],
  safeguarding_lead: [{ title: "Assigned safeguarding", path: "/safeguarding", icon: "safety" }],
  network_admin: [
    { title: "Network operations", path: "/network", icon: "home" },
    { title: "Operations", path: "/operations", icon: "clipboard", owns: ["/operations/*"] },
  ],
  can_network_steward: [{ title: "Network contracts", path: "/network-steward", icon: "clipboard" }],
  student: [
    { title: "Today", path: "/student", icon: "home", owns: ["/student/settings"] },
    { title: "Learn", path: "/student/courses", icon: "book",
      owns: ["/student/courses/*", "/classes", "/student/assignments", "/student/discussions", "/student/study-groups", "/groups"] },
    { title: "My School", path: "/student/my-school", icon: "users", owns: ["/student/experiences", "/student/report-card"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
    { title: "Support", path: "/student/support", icon: "support", owns: ["/support"] },
  ],
  guardian: [
    { title: "Home", path: "/guardian", icon: "home",
      owns: ["/guardian/apply", "/guardian/admission-offers", "/guardian/enrollment-changes"] },
    { title: "Children & academics", path: "/guardian/academics", icon: "book",
      owns: ["/guardian/attendance", "/guardian/course-approvals", "/guardian/report-cards", "/guardian/watching"] },
    { title: "School", path: "/guardian/experiences", icon: "users",
      owns: ["/guardian/field-trips", "/guardian/group-permissions", "/guardian/study-group-consent", "/guardian/enrichment", "/guardian/health"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  teacher: [
    { title: "Today", path: "/teacher", icon: "home", owns: ["/teacher/notices"] },
    { title: "Classes", path: "/classes", icon: "book", owns: ["/teacher/discussions", "/teacher/study-groups", "/groups"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Gradebook", path: "/teacher/gradebook", icon: "clipboard", owns: ["/teacher/gradebook/*", "/teacher/missing-work"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  registrar: [
    { title: "Operations", path: "/operations", icon: "clipboard",
      owns: ["/operations/launch", "/operations/launch/$programId", "/operations/workflows",
        "/operations/insights", "/operations/course-policies", "/operations/course-requests",
        "/operations/family-alerts", "/operations/field-trips", "/operations/health-review", "/operations/transfer-records", "/readiness", "/classes"] },
    { title: "Admissions", path: "/admissions", icon: "clipboard", owns: ["/admissions/*"] },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Sites", path: "/sites", icon: "home", owns: ["/sites/$siteId", "/sites/$siteId/publish"] },
    { title: "School years", path: "/operations/school-years", icon: "calendar" },
    { title: "Curriculum", path: "/operations/curriculum", icon: "book", owns: ["/operations/curriculum-marketplace"] },
    { title: "Administration", path: "/admin", icon: "users" },
  ],
  specialist: [
    { title: "Caseload", path: "/coach", icon: "support" },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
  counselor: [
    { title: "Caseload", path: "/counselor", icon: "support" },
    { title: "Students", path: "/staff/students", icon: "users", owns: ["/staff/students/$personId"] },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Messages", path: "/messages", icon: "messages" },
  ],
} satisfies Record<WorkspaceRole, readonly WorkspaceNavigationItem[]>;

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
