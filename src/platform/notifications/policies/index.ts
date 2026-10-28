import { registerNotificationPolicy } from "@/platform/notifications/policy";
import { admissionsStageChangedPolicy } from "./admissions-stage-changed";
import { assignmentMissingPolicy } from "./assignment-missing";
import { classAnnouncementPublishedPolicy } from "./class-announcement-published";
import { communicationMessageSentPolicy } from "./communication-message-sent";

/** Registry of all event-driven notification policies. Import for side effect. */
registerNotificationPolicy(assignmentMissingPolicy);
registerNotificationPolicy(communicationMessageSentPolicy);
registerNotificationPolicy(classAnnouncementPublishedPolicy);
registerNotificationPolicy(admissionsStageChangedPolicy);

export { admissionsStageChangedPolicy };
export { assignmentMissingPolicy };
export { classAnnouncementPublishedPolicy };
export { communicationMessageSentPolicy };
