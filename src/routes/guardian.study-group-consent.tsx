import {createFileRoute,redirect} from "@tanstack/react-router";

// Guardian consent decisions live on the canonical group-permissions surface.
// This legacy URL redirects so bookmarks and outstanding notification links keep working.
export const Route=createFileRoute("/guardian/study-group-consent")({
 beforeLoad:()=>{throw redirect({to:"/guardian/group-permissions"});},
});