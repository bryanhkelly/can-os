import { createFileRoute } from "@tanstack/react-router";
import { LaunchStudioEntry } from "@/components/launch-studio/LaunchStudioEntry";

export const Route = createFileRoute("/launch/")({ component: LaunchStudioEntry });
