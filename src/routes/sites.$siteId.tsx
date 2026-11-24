import { opaqueUuidPathParam } from "@/domain/opaque-url-id";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/sites/$siteId")({
  params: opaqueUuidPathParam("siteId"),
  component: Outlet,
});
