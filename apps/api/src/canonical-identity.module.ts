import {Module} from '@nestjs/common';
import {CanonicalIdentityService} from './identity.service';
/** Single shared provider instance; domain modules import rather than recreate it. */
@Module({providers:[CanonicalIdentityService],exports:[CanonicalIdentityService]})
export class CanonicalIdentityModule {}
