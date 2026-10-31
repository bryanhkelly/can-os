import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { TeacherPolicyRevisions } from "@/components/profiles/TeacherPolicyRevisions";
import { publishLaunchTeacherPolicy } from "@/modules/programs/launch-academics.functions";
import type { Snapshot } from "@/components/operations/LaunchAcademicSetupWorkspace";

export function LaunchTeacherQualificationPolicy({data,busy,run}:{
 data:Snapshot;
 busy:boolean;
 run:(operation:()=>Promise<unknown>,message:string)=>Promise<void>;
}){
 const router=useRouter();
 const [qualificationKeys,setQualificationKeys]=useState<string[]>([]);
 const [policyConfirmed,setPolicyConfirmed]=useState(false);
 return <>

 </>;
}
