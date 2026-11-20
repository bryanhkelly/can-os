import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice } from "@/components/workspace";
import type { GuardianApplicationHousehold, GuardianApplicationTransferRequest } from "@/domain/guardian-application-contracts";

/** Controlled presentation only. The parent owns transfer matching and
 * the server verifies all source-school and records-release authority.
 */
export function GuardianTransferAuthorizationFields({
  id, studentProfileId, availableTransfers, selectedTransfer, originTransferActionId,
  selectedProgramName, attempted, confirmedDestination, authorizedDestinationRecords,
  onOriginTransferChange, onConfirmedDestinationChange, onRecordsReleaseChange,
}: {
  id: string;
  studentProfileId: string;
  availableTransfers: readonly GuardianApplicationTransferRequest[];
  selectedTransfer?: GuardianApplicationTransferRequest;
  originTransferActionId: string;
  selectedProgramName?: string;
  attempted: boolean;
  confirmedDestination: boolean;
  authorizedDestinationRecords: boolean;
  onOriginTransferChange: (value: string) => void;
  onConfirmedDestinationChange: (checked: boolean) => void;
  onRecordsReleaseChange: (checked: boolean) => void;
}) {
  if (!availableTransfers.length || !studentProfileId) return null;
  return <div className="space-y-3  border p-4 sm:col-span-2">
          <Label htmlFor={`${id}-transfer`}>Connecting a move from another school?</Label>
          <Select id={`${id}-transfer`} value={originTransferActionId}
            onChange={event=>onOriginTransferChange(event.target.value)}>
            <option value="">No, this is a regular application</option>
            {availableTransfers.map(transfer=><option key={transfer.id} value={transfer.id}>
              From {transfer.originSchoolName} to {transfer.destinationSchoolName}
              {transfer.originExited?" · origin exit completed":" · origin exit pending"}
            </option>)}
          </Select>
          {selectedTransfer&&<>
            <p className="text-sm">Your transfer request names <strong>{selectedTransfer.destinationSchoolName}</strong>.
              This application is for <strong>{selectedProgramName}</strong>. It will remain subject to this school's
              admissions decision, seat capacity and a separately accepted offer.</p>
            {!selectedTransfer.originExited&&<WorkspaceNotice tone="info">
              Your original school has not yet completed the official exit. Destination enrollment activation will wait for that decision.
            </WorkspaceNotice>}
            <Field label="I confirm that the selected Program is the school I am applying to for this transfer. I understand that the origin-school request does not grant admission to the new school."
              required error={attempted&&!confirmedDestination?"Confirm the receiving school for this transfer.":undefined}>
              <Checkbox checked={confirmedDestination} onChange={event=>onConfirmedDestinationChange(event.target.checked)}/>
            </Field>
            <Field label="I authorize the official transcript from my child's originating CAN school to be made available to this specifically selected receiving-school Program for admissions and academic placement, after the issuing records office has completed its authorized transfer. This does not authorize other schools or grant access to medical, custody or safeguarding records."
              required error={attempted&&!authorizedDestinationRecords?"Authorize records release to this receiving-school Program.":undefined}>
              <Checkbox checked={authorizedDestinationRecords} onChange={event=>onRecordsReleaseChange(event.target.checked)}/>
            </Field>
          </>}
        </div>;
}

/** Existing verified students keep their identity fields read-only.
 * No People or household records are created by this component.
 */
export function GuardianStudentIdentityFields({
  id, households, studentProfileId, householdId, firstName, lastName, grade,
  attempted, onHouseholdChange, onFirstNameChange, onLastNameChange, onGradeChange,
}: {
  id: string;
  households: readonly GuardianApplicationHousehold[];
  studentProfileId: string;
  householdId: string;
  firstName: string;
  lastName: string;
  grade: string;
  attempted: boolean;
  onHouseholdChange: (value: string) => void;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onGradeChange: (value: string) => void;
}) {
  return <>
<div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${id}-household`}>Your family</Label>
          <Select id={`${id}-household`} name="householdId" value={householdId} disabled={!!studentProfileId}
            aria-describedby={`${id}-household-hint`} onChange={event => onHouseholdChange(event.target.value)}>
            <option value="">Create a new family household</option>
            {households.map(family => <option key={family.id} value={family.id}>{family.name}</option>)}
          </Select>
          <p id={`${id}-household-hint`} className="text-xs leading-5 text-muted-foreground">
            Choose the same family for siblings. Only families linked to your account can be used.
          </p>
        </div>
        <Field label="Student legal first name" required error={attempted&&!firstName.trim()?"Enter the student's legal first name.":undefined}>
          <Input id={`${id}-first-name`} name="studentFirstName" autoComplete="off" required maxLength={100}
            readOnly={!!studentProfileId} value={firstName} onChange={event => onFirstNameChange(event.target.value)} />
        </Field>
        <Field label="Student legal last name" required error={attempted&&!lastName.trim()?"Enter the student's legal last name.":undefined}>
          <Input id={`${id}-last-name`} name="studentLastName" autoComplete="off" required maxLength={100}
            readOnly={!!studentProfileId} value={lastName} onChange={event => onLastNameChange(event.target.value)} />
        </Field>
        <Field label="Entering grade level" className="sm:col-span-2" required
          description="Use the grade the student is applying to enter."
          error={attempted&&!grade.trim()?"Enter the grade the student is applying to enter.":undefined}>
          <Input id={`${id}-grade`} name="gradeLevel" required maxLength={10} value={grade}
            readOnly={!!studentProfileId} placeholder="For example, 9"
            onChange={event => onGradeChange(event.target.value)} />
        </Field>
  </>;
}
