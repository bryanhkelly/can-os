import type {BecomunaBrowserApi} from './client';
import {createCampaignApi} from './campaign-api';
import {createGoLinkApi} from './go-link-api';
import {createEngagementRegistryApi} from './engagement-registry-api';
import {createMarketingPackageApi} from './marketing-package-api';
import {createMarketingArtifactApi} from './marketing-artifact-api';
import {createSenderAdminApi} from './sender-admin-api';
/** All 39 authenticated engagement operations on one configured browser client. */
export function createEngagementApi(client:BecomunaBrowserApi){
 return {...createCampaignApi(client),...createGoLinkApi(client),...createEngagementRegistryApi(client),...createMarketingPackageApi(client),...createMarketingArtifactApi(client),...createSenderAdminApi(client)};
}
export type EngagementApi=ReturnType<typeof createEngagementApi>;
