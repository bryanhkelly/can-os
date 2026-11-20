import type { listLaunches } from "@/modules/programs/launch.functions";
import type { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import type { readLaunchSitePublication } from "@/modules/sites/launch-site-publication.functions";
import type { getNoncreditEnrollmentPublisher } from "@/modules/enrollment/noncredit-enrollment-publication.functions";
import type { readSiteProgramsAudiencesV61 } from "@/modules/programs/site-programs-audiences-v61.functions";

/** Rendering state only. Each owning server reader remains independently authoritative. */
export type ReadinessRecord<T> =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ready"; value: T };

export type LaunchReadinessPrograms = Awaited<ReturnType<typeof listLaunches>>["launches"];
export type LaunchReadinessSolutions = Awaited<ReturnType<typeof readCanonicalBlueprintWorkspace>>;
export type LaunchReadinessPublication = Awaited<ReturnType<typeof readLaunchSitePublication>>;
export type LaunchReadinessNoncredit = Awaited<ReturnType<typeof getNoncreditEnrollmentPublisher>>;
export type LaunchReadinessIntent = Awaited<ReturnType<typeof readSiteProgramsAudiencesV61>>;
export type LaunchReadinessContext = "prepare" | "open";
