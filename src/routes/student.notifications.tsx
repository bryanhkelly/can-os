import {createFileRoute,redirect} from "@tanstack/react-router";
/** Retain legacy deep links; all roles now use one notification center. */
export const Route=createFileRoute("/student/notifications")({beforeLoad:()=>{throw redirect({to:"/notifications"});}});
