import { createServerFn } from "@tanstack/react-start";
import {
  readEngagementCampaignWorkspaceInput,
  saveCampaignRecipientListInput,
  queueEngagementCampaignInput,
  cancelEngagementCampaignInput,
  readCampaignListMembersInput,
  updateCampaignListMemberInput,
} from "./engagement-campaigns.inputs";

/** Browser-safe RPC declarations. Database operations and authorization stay in the server implementation. */

export const readEngagementCampaignWorkspace = createServerFn({ method: "GET" })
  .validator((input: unknown) => readEngagementCampaignWorkspaceInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-campaigns.server");
    return implementation.readEngagementCampaignWorkspace(data);
  });

export const saveCampaignRecipientList = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveCampaignRecipientListInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-campaigns.server");
    return implementation.saveCampaignRecipientList(data);
  });

export const queueEngagementCampaign = createServerFn({ method: "POST" })
  .validator((input: unknown) => queueEngagementCampaignInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-campaigns.server");
    return implementation.queueEngagementCampaign(data);
  });

export const cancelEngagementCampaign = createServerFn({ method: "POST" })
  .validator((input: unknown) => cancelEngagementCampaignInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-campaigns.server");
    return implementation.cancelEngagementCampaign(data);
  });

export const readCampaignListMembers = createServerFn({ method: "GET" })
  .validator((input: unknown) => readCampaignListMembersInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-campaigns.server");
    return implementation.readCampaignListMembers(data);
  });

export const updateCampaignListMember = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateCampaignListMemberInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./engagement-campaigns.server");
    return implementation.updateCampaignListMember(data);
  });
