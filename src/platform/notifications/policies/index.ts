import { registerNotificationPolicy } from "@/platform/notifications/policy";
import { assignmentMissingPolicy } from "./assignment-missing";

/** Registry of all event-driven notification policies. Import for side effect. */
registerNotificationPolicy(assignmentMissingPolicy);

export { assignmentMissingPolicy };
