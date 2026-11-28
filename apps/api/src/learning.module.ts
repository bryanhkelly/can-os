import { Module } from '@nestjs/common';
import { IdentityModule } from './identity.module';
import { LearningController } from './learning.controller';
import { ClassroomController } from './classroom.controller';
import { InstructionalController } from './instructional.controller';
import { RehearsalController } from './rehearsal.controller';
import { RoomController } from './room.controller';

/** WS07 owns learner delivery, Class sessions and Classroom Connect transport.
 * Keep role-workspaces and Class Offering administration separate until their
 * cross-domain boundaries are reconciled with participation and publication.
 */
@Module({
 imports:[IdentityModule],
 controllers:[LearningController,ClassroomController,RoomController,InstructionalController,RehearsalController],
})
export class LearningModule {}
