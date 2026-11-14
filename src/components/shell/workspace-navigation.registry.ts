import { ownedRoutes } from "./route-navigation";
import { roleCapabilities } from "@/domain/access-context";
import { optionalSearchUuid } from "@/lib/route-search";

const destinationContextKeys: Record<string, readonly string[]> = {
  "/home": ["siteId", "programId"],
  "/launch/school": ["siteId", "programId"],
  "/launch/hub/school": ["siteId", "programId"],
  "/admissions": ["siteId", "programId"],
  "/staff/students": ["siteId", "programId"],
  "/operations/school-years": ["siteId", "programId"],
  "/operations/interest-events": ["siteId", "programId"],
  "/operations/insights": ["siteId", "programId"],
  "/settings": ["siteId"],
  "/site-website": ["siteId", "programId"],
  "/staff/attendance": ["programId"],
  "/operations/curriculum": ["programId"],
  "/operations/teacher-marketplace": ["programId"],
  "/classes": ["section"],
  "/student/courses": ["section"],
  "/teacher/gradebook": ["section"],
  "/guardian/students": ["section"],
  "/calendar": ["section"],
};

export function workspaceDestination(path: string, currentSearch: string): string {
  const current = new URLSearchParams(currentSearch);
  const selection = new URLSearchParams();
  for (const key of destinationContextKeys[path] ?? []) {
    const value = optionalSearchUuid.parse(current.get(key) ?? undefined);
    if (value) selection.set(key, value);
  }
  return selection.size ? `${path}?${selection.toString()}` : path;
}

export interface WorkspaceNavigationItem {
  title: string;
  path: string;
  icon: "home" | "building" | "globe" | "book" | "calendar" | "clipboard" | "support" | "messages" | "safety" | "users" | "settings";
  owns?: readonly string[];
}

export const workspaceHome = {
  academic_content_creator: "/canonical/content",
  academic_content_reviewer: "/canonical/content-reviews",
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
  can_jurisdiction_reviewer: "/home",
} as const;

export type WorkspaceRole = keyof typeof workspaceHome;

const nestedRouteExceptions: Partial<Record<WorkspaceRole, Record<string, readonly string[]>>> = {
  student: { "/student/courses": ["/student/courses/*"] },
  teacher: { "/teacher/gradebook": ["/teacher/gradebook/*"] },
};

const schoolAdministrationLinks = [
  { title: "Launch", path: "/launch/school", icon: "building" },
  { title: "Admissions", path: "/admissions", icon: "clipboard" },
  { title: "Students", path: "/staff/students", icon: "users" },
  { title: "School years", path: "/operations/school-years", icon: "calendar" },
  { title: "Curriculum", path: "/operations/curriculum", icon: "book" },
  { title: "Teachers", path: "/operations/teacher-marketplace", icon: "users" },
  { title: "Administration", path: "/admin", icon: "users" },
] satisfies readonly WorkspaceNavigationItem[];

const siteAdminProfileLink = {
  title: "School profile", path: "/sites", icon: "building",
} satisfies WorkspaceNavigationItem;

/**
 * Role-specific destinations. Home and Messages are generated once below.
 */
const roleLinks = {
  academic_content_creator: [],
  academic_content_reviewer: [],
  site_admin: [...schoolAdministrationLinks, siteAdminProfileLink],
  site_website_editor: [{ title: "Website", path: "/site-website", icon: "globe" }],
  room_facilitator: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Attendance", path: "/staff/attendance", icon: "clipboard" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
  ],
  site_staff: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Students", path: "/staff/students", icon: "users" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
  ],
  site_leader: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "Students", path: "/staff/students", icon: "users" },
    { title: "Staff", path: "/staff/teachers", icon: "users" },
    { title: "Schedule", path: "/calendar", icon: "calendar" },
    { title: "Attendance", path: "/staff/attendance", icon: "clipboard" },

  ],
  paraeducator: [
    { title: "Report a safety concern", path: "/safeguarding", icon: "safety" },
    { title: "My profile", path: "/profiles", icon: "users" },
  ],
  safeguarding_responder: [{ title: "Assigned safeguarding", path: "/safeguarding", icon: "safety" }],
  safeguarding_lead: [{ title: "Assigned safeguarding", path: "/safeguarding", icon: "safety" }],
  network_admin: [],
  can_network_steward: [
    { title: "Jurisdiction profiles", path: "/operations/jurisdiction-profiles", icon: "clipboard" },
  ],
  can_jurisdiction_reviewer: [],
  student: [
    { title: "Learn", path: "/student/courses", icon: "book" },
    { title: "School profile", path: "/student/my-school", icon: "users" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
    { title: "Support", path: "/student/support", icon: "support" },
  ],
  guardian: [
    { title: "Students", path: "/guardian/students", icon: "book" },
    { title: "School profile", path: "/guardian/experiences", icon: "users" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
  ],
  teacher: [
    { title: "Classes", path: "/classes", icon: "book" },
    { title: "Students", path: "/staff/students", icon: "users" },
    { title: "Gradebook", path: "/teacher/gradebook", icon: "clipboard" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
  ],
  registrar: schoolAdministrationLinks,
  specialist: [
    { title: "Students", path: "/staff/students", icon: "users" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
  ],
  counselor: [
    { title: "Students", path: "/staff/students", icon: "users" },
    { title: "Calendar", path: "/calendar", icon: "calendar" },
  ],
} satisfies Record<WorkspaceRole, readonly WorkspaceNavigationItem[]>;

export const workspaceHomeTitle = "Home";

function withHome(role: WorkspaceRole, links: readonly WorkspaceNavigationItem[]): readonly WorkspaceNavigationItem[] {
  const path = workspaceHome[role];
  const owns = ownedRoutes(role, path);
  const home: WorkspaceNavigationItem = { title: workspaceHomeTitle, path, icon: "home", ...(owns.length ? { owns } : {}) };
  const destinations = links.map(item => {
    // Only non-route-tree nested workspace panels are listed here.
    const owned = [...ownedRoutes(role, item.path), ...(nestedRouteExceptions[role]?.[item.path] ?? [])];
    return { ...item, ...(owned.length ? { owns: owned } : {}) };
  });
  const messages: WorkspaceNavigationItem = { title: "Messages", path: "/messages", icon: "messages" };
  const canSendMessages = roleCapabilities[role]?.includes("communication.send") === true;
  const settingsOwns = ownedRoutes(role, "/settings");
  const settings: WorkspaceNavigationItem = { title: "Settings", path: "/settings", icon: "settings", ...(settingsOwns.length ? {owns:settingsOwns} : {}) };
  return [home, ...destinations,
    ...(canSendMessages && !destinations.some(item => item.path === messages.path) ? [messages] : []),
    settings,
  ];
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
  // Wildcards are reserved for intentionally nested journeys; core operations
  // destinations are enumerated explicitly above.
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
