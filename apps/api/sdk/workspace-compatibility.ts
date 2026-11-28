// Compile against both actual generated SDK and root application ports.
// No assertion casts, dynamic dispatcher or simulated domain responses.
import type {BecomunaBrowserApi} from './client';
import {createNestEngagementWorkspaces} from './engagement-workspaces';
import type {GoLinkWorkspaceTransport} from '../../../src/modules/engagement/go-link-workspace-transport';
import type {EngagementWorkspaceTransport} from '../../../src/modules/engagement/engagement-workspace-transport';
import type {MarketingWorkspaceTransport} from '../../../src/modules/programs/marketing-workspace-transport';
import type {SenderWorkspaceTransport} from '../../../src/modules/communication/sender-workspace-transport';
import type {CampaignTransport} from '../../../src/domain/campaign-workspace-api';
export function checkWorkspaceCompatibility(client:BecomunaBrowserApi){
 const ports=createNestEngagementWorkspaces(client);
 const go:GoLinkWorkspaceTransport=ports.go;
 const campaign:CampaignTransport=ports.campaign;
 const engagement:EngagementWorkspaceTransport=ports.engagement;
 const marketing:MarketingWorkspaceTransport=ports.marketing;
 const sender:SenderWorkspaceTransport=ports.sender;
 return {go,campaign,engagement,marketing,sender};
}
