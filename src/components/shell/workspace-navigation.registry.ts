export interface WorkspaceNavigationItem {
  title: string;
  path: string;
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
  site_website_editor: [{ title: "Website", path: "/site-website" }],
  room_facilitator: [
    { title: "Report a safety concern", path: "/safeguarding" },
    { title: "Today", path: "/site/day" },
    { title: "Attendance", path: "/staff/attendance" },
    { title: "Roster", path: "/site/day" },
  ],
  site_staff: [
    { title: "Report a safety concern", path: "/safeguarding" },
    { title: "Today", path: "/site/day" },
    { title: "Students", path: "/staff/students" },
    { title: "Calendar", path: "/calendar" },
    { title: "Messages", path: "/messages" },
  ],
  site_leader: [
    { title: "Report a safety concern", path: "/safeguarding" },
    { title: "Today", path: "/site/day" },
    { title: "Students", path: "/staff/students" },
    { title: "Staff", path: "/staff/teachers" },
    { title: "Schedule", path: "/calendar" },
    { title: "Attendance", path: "/staff/attendance" },
    { title: "Community", path: "/site-website" },
    { title: "Operations", path: "/operations" },
  ],
  paraeducator: [
    { title: "Report a safety concern", path: "/safeguarding" },
    { title: "My profile", path: "/profiles" },
  ],
  safeguarding_responder: [{ title: "Assigned safeguarding", path: "/safeguarding" }],
  safeguarding_lead: [{ title: "Assigned safeguarding", path: "/safeguarding" }],
  network_admin: [
    { title: "Network operations", path: "/network" },
    { title: "Operations", path: "/operations" },
  ],
  can_network_steward: [{ title: "Network contracts", path: "/network-steward" }],
  student: [
    { title: "Today", path: "/student" },
    { title: "Learn", path: "/student/courses" },
    { title: "My School", path: "/student/my-school" },
    { title: "Calendar", path: "/calendar" },
    { title: "Messages", path: "/messages" },
    { title: "Support", path: "/student/support" },
  ],
  guardian: [
    { title: "Home", path: "/guardian" },
    { title: "Children", path: "/guardian/academics" },
    { title: "School", path: "/guardian/experiences" },
    { title: "Calendar", path: "/calendar" },
    { title: "Messages", path: "/messages" },
  ],
  teacher: [
    { title: "Today", path: "/teacher" },
    { title: "Classes", path: "/classes" },
    { title: "Students", path: "/staff/students" },
    { title: "Gradebook", path: "/teacher/gradebook" },
    { title: "Calendar", path: "/calendar" },
    { title: "Messages", path: "/messages" },
  ],
  registrar: [
    { title: "Operations", path: "/operations" },
    { title: "Admissions", path: "/admissions" },
    { title: "Students", path: "/staff/students" },
    { title: "Sites", path: "/sites" },
    { title: "School years", path: "/operations/school-years" },
    { title: "Curriculum", path: "/operations/curriculum" },
    { title: "Administration", path: "/admin" },
  ],
  specialist: [
    { title: "Caseload", path: "/coach" },
    { title: "Students", path: "/staff/students" },
    { title: "Calendar", path: "/calendar" },
    { title: "Messages", path: "/messages" },
  ],
  counselor: [
    { title: "Caseload", path: "/counselor" },
    { title: "Students", path: "/staff/students" },
    { title: "Calendar", path: "/calendar" },
    { title: "Messages", path: "/messages" },
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
  return links
    .filter(item => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
}
