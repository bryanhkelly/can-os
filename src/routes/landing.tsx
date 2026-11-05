import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Public campaign entry. This is never an authorized launch operation. */
export const Route = createFileRoute("/landing")({ component: Outlet });
