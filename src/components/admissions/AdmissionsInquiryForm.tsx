import { useEffect,useState } from "react";
import { searchAdmissionsHouseholds } from "@/modules/enrollment/admissions-intake.functions";
import { AdmissionsPageNavigation } from "./AdmissionsPageNavigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
 const [attempted,setAttempted]=useState(false);
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
  <form className="mt-4" onSubmit={event=>{
    event.preventDefault();setAttempted(true);
    if(!programId||(convertibleInterest&&!contactReviewed))return;
    setAttempted(false);
    onSubmit(event);
   }} aria-busy={busy}>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
    <Field className="sm:col-span-2" label="Program" required
     error={attempted&&!programId?"Choose a Program before creating this inquiry.":undefined}>
     <Select disabled={convertibleInterest} value={programId} onChange={e=>{setProgramId(e.target.value);setExistingApplicationId("");setExistingStudentKey("");setCreateHouseholdConfirmed(false);}}>
     <option value="">Choose program</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </Select>
    </Field>
    {attempted&&convertibleInterest&&!contactReviewed&&
     <p role="alert" className="text-sm text-destructive sm:col-span-2">Review the family's contact information in the confirmation above before creating this inquiry.</p>}
    <Field className="sm:col-span-2" label="Student identity"
     description="Existing students reuse their identity and managing guardian. Existing households are preserved. Creating an inquiry does not activate enrollment.">
     <Select disabled={convertibleInterest} value={existingStudentKey}
      onChange={e=>{setExistingStudentKey(e.target.value);setExistingApplicationId("");setCreateHouseholdConfirmed(false);}}>
      <option value="">Create a new student</option>
      {existingStudents.map(student=><option key={studentKey(student)} value={studentKey(student)}>
       {student.studentFirstName} {student.studentLastName} — guardian: {student.guardianFirstName} {student.guardianLastName}
       {!student.householdId?" (new household required)":""}
      </option>)}
     </Select>
    </Field>
    <div className="sm:col-span-2"><AdmissionsPageNavigation selection={selection} hasMore={existingStudentHasMore} kind="students"/></div>
    {existingStudent&&!existingStudent.householdId&&<Label className="flex items-start gap-2 sm:col-span-2">
     <Checkbox required checked={createHouseholdConfirmed} onChange={e=>setCreateHouseholdConfirmed(e.target.checked)}/>
     {" "}I confirm creating the missing household for this existing student and managing guardian. Neither currently belongs to a household.
    </Label>}
    {!existingStudent&&<>
    <Field className="sm:col-span-2" label="Find a sibling household (optional)" error={householdError}>
      <Input type="search" value={householdSearch} onChange={e=>{setHouseholdSearch(e.target.value);setExistingApplicationId("");}} placeholder="Search student name or application ID" />
    </Field>
    {householdLoading&&<p role="status" className="text-xs sm:col-span-2">Searching households…</p>}
    <Field className="sm:col-span-2" label="Household for this inquiry"
      description="Only households with an independently verified managing guardian are offered for reuse. The receiving command rechecks the relationship and the guardian email before linking a sibling.">
      <Select
        disabled={convertibleInterest||householdLoading} value={existingApplicationId} onChange={e=>setExistingApplicationId(e.target.value)}>
        <option value="">Create new household</option>
        {householdMatches.map(r=>
          <option value={r.id} key={r.id}>{r.studentFirst} {r.studentLast} — same guardian</option>)}
      </Select>
    </Field>
    <Field label="Student first name" required><Input value={studentFirstName} onChange={e=>setStudentFirstName(e.target.value)}/></Field>
    <Field label="Student last name" required><Input value={studentLastName} onChange={e=>setStudentLastName(e.target.value)}/></Field>
    <Field label="Guardian first name" required><Input value={guardianFirstName} onChange={e=>setGuardianFirstName(e.target.value)}/></Field>
    <Field label="Guardian last name" required><Input value={guardianLastName} onChange={e=>setGuardianLastName(e.target.value)}/></Field>
    <Field label="Guardian email" required><Input type="email" value={guardianEmail} onChange={e=>setGuardianEmail(e.target.value)}/></Field>
    <Field label="Entering grade"><Input value={gradeLevel} onChange={e=>setGradeLevel(e.target.value)}/></Field>
    </>}
    <Field label="Inquiry source"><Select value={source} disabled={convertibleInterest} onChange={e=>setSource(e.target.value)}><option value="school_direct">School inquiry</option><option value="published_site">Published Site</option><option value="church_referral">Church referral</option><option value="family_referral">Family referral</option><option value="event">Event</option><option value="other">Other</option></Select></Field>
    <Field className="sm:col-span-2" label="Notes"><Textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}/></Field>
    <Button type="submit" disabled={busy}>Create inquiry</Button>
    </fieldset>
   </form>
 </>;
}
