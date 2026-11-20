import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { siteProgramSelectionSchema } from "@/lib/route-search";
import { ScopedAdminConsole } from "@/components/operations/ScopedAdminConsole";
export { ScopedAdminConsole } from "@/components/operations/ScopedAdminConsole";

export const adminSearchSchema = siteProgramSelectionSchema.pick({siteId:true}).extend({
  inviteRole: z.enum(["registrar","site_website_editor"]).optional().catch(undefined),
});

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string,unknown>): {siteId?:string;inviteRole?:string} =>
    adminSearchSchema.parse(search),
  beforeLoad: ({search}) => {
    if(search.inviteRole) throw redirect({to:"/admin/invite",search:adminSearchSchema.parse(search),replace:true});
  },
  component: AdminConsolePage,
});

function AdminConsolePage(){
  const selection = Route.useSearch();
  return <ScopedAdminConsole key={JSON.stringify(selection)} selection={selection}/>;
}
