import { createFileRoute } from "@tanstack/react-router";
import { SyntheticProfileExplorer } from "@/components/profiles/SyntheticProfileExplorer";
export const Route = createFileRoute("/profiles")({ component: SyntheticProfileExplorer });
