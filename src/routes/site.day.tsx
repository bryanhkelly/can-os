import { createFileRoute } from "@tanstack/react-router";
import { SiteDayPage } from "@/components/operations/SiteDayPage";

export const Route = createFileRoute("/site/day")({ component: SiteDayPage });
