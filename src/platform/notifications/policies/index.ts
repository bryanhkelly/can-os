import { registerNotificationPolicy } from "@/platform/notifications/policy";
import { admissionsStageChangedPolicy } from "./admissions-stage-changed";
import { assignmentMissingPolicy } from "./assignment-missing";
import { classAnnouncementPublishedPolicy } from "./class-announcement-published";
import { communicationMessageSentPolicy } from "./communication-message-sent";
import { sectionScheduleChangedPolicy } from "./section-schedule-changed";
import { sectionEnrollmentWithdrawnPolicy } from "./section-enrollment-withdrawn";
import { sectionWaitlistSeatOfferedPolicy } from "./section-waitlist-seat-offered";
import { sectionCreationRequestDeclinedPolicy, sectionCreationRequestFulfilledPolicy } from "./section-creation-request-outcomes";

/** Registry of all event-driven notification policies. Import for side effect. */
registerNotificationPolicy(assignmentMissingPolicy);
registerNotificationPolicy(communicationMessageSentPolicy);
registerNotificationPolicy(classAnnouncementPublishedPolicy);
registerNotificationPolicy(admissionsStageChangedPolicy);
registerNotificationPolicy(sectionScheduleChangedPolicy);
registerNotificationPolicy(sectionEnrollmentWithdrawnPolicy);
registerNotificationPolicy(sectionWaitlistSeatOfferedPolicy);
registerNotificationPolicy(sectionCreationRequestDeclinedPolicy);
registerNotificationPolicy(sectionCreationRequestFulfilledPolicy);

export { admissionsStageChangedPolicy };
export { assignmentMissingPolicy };
export { classAnnouncementPublishedPolicy };
export { communicationMessageSentPolicy };
export { sectionScheduleChangedPolicy };
export { sectionEnrollmentWithdrawnPolicy };
export { sectionWaitlistSeatOfferedPolicy };
export { sectionCreationRequestDeclinedPolicy, sectionCreationRequestFulfilledPolicy };
