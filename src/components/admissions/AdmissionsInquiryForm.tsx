import { useEffect,useState } from "react";
import { searchAdmissionsHouseholds } from "@/modules/enrollment/admissions-intake.functions";
import { AdmissionsPageNavigation } from "./AdmissionsPageNavigation";
type InquiryFormProps={
 children?:never;
 onSubmit:(event:import("react").FormEvent<HTMLFormElement>)=>void;
 programs:Array<{id:string;name:string}>;
 programId:string;setProgramId:(value:string)=>void;
 convertibleInterest:boolean;contactReviewed:boolean;busy:boolean;
 existingStudentKey:string;setExistingStudentKey:(value:string)=>void;
 existingStudents:Array<{studentProfileId:string;guardianPersonId:string;householdId:string|null;studentFirstName:string;studentLastName:string;guardianFirstName:string;guardianLastName:string;programId:string}>;
 existingStudent:{householdId:string|null}|undefined;
 createHouseholdConfirmed:boolean;setCreateHouseholdConfirmed:(value:boolean)=>void;
 existingApplicationId:string;setExistingApplicationId:(value:string)=>void;
 studentFirstName:string;setStudentFirstName:(value:string)=>void;
 studentLastName:string;setStudentLastName:(value:string)=>void;
 guardianFirstName:string;setGuardianFirstName:(value:string)=>void;
 guardianLastName:string;setGuardianLastName:(value:string)=>void;
 guardianEmail:string;setGuardianEmail:(value:string)=>void;
 gradeLevel:string;setGradeLevel:(value:string)=>void;
 source:string;setSource:(value:string)=>void;
 notes:string;setNotes:(value:string)=>void;
 selection:{siteId?:string;programId?:string;application?:string;interest?:string;page?:number;studentPage?:number;search?:string};
 existingStudentHasMore:boolean;
};

export function AdmissionsInquiryForm({onSubmit,programs,programId,setProgramId,convertibleInterest,contactReviewed,busy,existingStudentKey,setExistingStudentKey,existingStudents,existingStudent,createHouseholdConfirmed,setCreateHouseholdConfirmed,existingApplicationId,setExistingApplicationId,studentFirstName,setStudentFirstName,studentLastName,setStudentLastName,guardianFirstName,setGuardianFirstName,guardianLastName,setGuardianLastName,guardianEmail,setGuardianEmail,gradeLevel,setGradeLevel,source,setSource,notes,setNotes,selection,existingStudentHasMore}:InquiryFormProps){
 const [householdSearch,setHouseholdSearch]=useState("");
 const [householdMatches,setHouseholdMatches]=useState<Array<{id:string;programId:string;studentFirst:string;studentLast:string}>>([]);
 const [householdError,setHouseholdError]=useState("");
 const [householdLoading,setHouseholdLoading]=useState(false);
 useEffect(()=>{
  let active=true;
  if(!programId||householdSearch.trim().length<2){
   setHouseholdMatches([]);setHouseholdError("");setHouseholdLoading(false);return;
  }
  setHouseholdLoading(true);
  void searchAdmissionsHouseholds({data:{programId,search:householdSearch.trim()}})
   .then(rows=>{if(active){setHouseholdMatches(rows);setHouseholdError("");setHouseholdLoading(false);}})
   .catch(()=>{if(active){setHouseholdMatches([]);setHouseholdLoading(false);setHouseholdError("Unable to search authorized households.");}});
  return ()=>{active=false;};
 },[programId,householdSearch]);
 const studentKey=(student:InquiryFormProps["existingStudents"][number])=>
  `${student.studentProfileId}:${student.guardianPersonId}:${student.householdId??"new"}`;
 return <>
   <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
    <label className="text-sm sm:col-span-2">Program<select className="mt-1 w-full rounded border bg-background p-2" required disabled={convertibleInterest} value={programId} onChange={e=>{setProgramId(e.target.value);setExistingApplicationId("");setExistingStudentKey("");setCreateHouseholdConfirmed(false);}}>
     <option value="">Choose program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <label className="text-sm sm:col-span-2">Student identity
     <select className="mt-1 block w-full rounded border bg-background p-2" disabled={convertibleInterest} value={existingStudentKey}
      onChange={e=>{setExistingStudentKey(e.target.value);setExistingApplicationId("");setCreateHouseholdConfirmed(false);}}>
      <option value="">Create a new student</option>
      {existingStudents.map(student=><option key={studentKey(student)} value={studentKey(student)}>
       {student.studentFirstName} {student.studentLastName} — guardian: {student.guardianFirstName} {student.guardianLastName}
       {!student.householdId?" (new household required)":""}
      </option>)}
     </select>
     <AdmissionsPageNavigation selection={selection} hasMore={existingStudentHasMore} kind="students"/>
     <span className="mt-1 block text-xs text-muted-foreground">
      Existing students reuse their identity and managing guardian. Existing households are preserved. Creating an inquiry does not activate enrollment.
     </span>
    </label>
    {existingStudent&&!existingStudent.householdId&&<label className="text-sm sm:col-span-2">
     <input type="checkbox" required checked={createHouseholdConfirmed} onChange={e=>setCreateHouseholdConfirmed(e.target.checked)}/>
     {" "}I confirm creating the missing household for this existing student and managing guardian. Neither currently belongs to a household.
    </label>}
    {!existingStudent&&<>
    <label className="text-sm sm:col-span-2">Find a sibling household (optional)
      <input className="mt-1 block w-full rounded border bg-background p-2" value={householdSearch} onChange={e=>{setHouseholdSearch(e.target.value);setExistingApplicationId("");}} placeholder="Search student name or application ID" />
      {householdLoading&&<span role="status" className="block text-xs">Searching households…</span>}
      {householdError&&<span role="alert" className="block text-xs">{householdError}</span>}
      <select className="mt-1 block w-full rounded border bg-background p-2"
        disabled={convertibleInterest||householdLoading} value={existingApplicationId} onChange={e=>setExistingApplicationId(e.target.value)}>
        <option value="">Create new household</option>
        {householdMatches.map(r=>
          <option value={r.id} key={r.id}>{r.studentFirst} {r.studentLast} — same guardian</option>)}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        Only households with an independently verified managing guardian
        are offered for reuse. The receiving command rechecks the relationship
        and the guardian email before linking a sibling.
      </span>
    </label>
    <label className="text-sm">Student first name<input required value={studentFirstName} onChange={e=>setStudentFirstName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Student last name<input required value={studentLastName} onChange={e=>setStudentLastName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Guardian first name<input required value={guardianFirstName} onChange={e=>setGuardianFirstName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Guardian last name<input required value={guardianLastName} onChange={e=>setGuardianLastName(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Guardian email<input required type="email" value={guardianEmail} onChange={e=>setGuardianEmail(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Entering grade<input value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/></label>
    </>}
    <label className="text-sm">Inquiry source<select value={source} disabled={convertibleInterest} onChange={e=>setSource(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"><option value="school_direct">School inquiry</option><option value="published_site">Published Site</option><option value="church_referral">Church referral</option><option value="family_referral">Family referral</option><option value="event">Event</option><option value="other">Other</option></select></label>
    <label className="text-sm sm:col-span-2">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1 w-full rounded border bg-background p-2" rows={2}/></label>
    <button type="submit" disabled={busy||!programId||(convertibleInterest&&!contactReviewed)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create inquiry</button>
   </form>
 </>;
}
