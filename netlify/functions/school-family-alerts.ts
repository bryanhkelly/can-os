import { invokeScheduledEndpoint } from "../invoke-scheduled-endpoint";

/** Rapid school-family notification dispatch, independent of slower learning
 * maintenance jobs. Every send is permission-checked by the application.
 */
export default () => invokeScheduledEndpoint("/api/family-alert-delivery", "school-family-alerts", "urgent family dispatch");

export const config={schedule:"* * * * *"};
