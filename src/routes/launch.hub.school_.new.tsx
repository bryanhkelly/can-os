import { createFileRoute, redirect } from "@tanstack/react-router";

/** Keep historical school-create bookmarks without a second Site creator. */
export const Route=createFileRoute("/launch/hub/school_/new")({
  beforeLoad:()=>{throw redirect({to:"/launch/site",search:{step:"site"},replace:true});},
  component:()=>null,
});
