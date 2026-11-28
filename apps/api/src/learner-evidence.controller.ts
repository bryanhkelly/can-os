import {Controller,Get,Post,Body,Query,Req} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiBody,ApiOkResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {validated} from './learning.contracts';
import * as c from './credentials.contracts';
import {LearnerRead} from './assessments-outcomes-operation';
@ApiTags('Private learner evidence')
@Controller()
export class LearnerEvidenceController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Get('me/class-completion-evidence')
 @LearnerRead()
 @ApiOperation({operationId:'getNativeClassCanonicalEvidence',summary:'getNativeClassCanonicalEvidence'})
 @ApiQuery({name:'classEnrollmentId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.nativeDocs.evidence})
 async getNativeClassCanonicalEvidence(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.nativeEnrollment,query);return c.nativeEvidence.parse(await this.identity.runWorkflow(()=>workflow.getNativeClassCanonicalEvidence(input)));}

 @Get('me/course-evidence')
 @LearnerRead()
 @ApiOperation({operationId:'getCanonicalCourseEvidence',summary:'Private learner-owned observations and current canonical results, excluding survey answers'})
 @ApiQuery({name:'courseAttemptId',schema:{type:'string',format:'uuid'},required:true})
 @ApiOkResponse({schema:c.courseEvidenceDoc})
 async getCanonicalCourseEvidence(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.courseEvidenceQuery,query);return c.courseEvidenceResult.parse(await this.identity.runWorkflow(()=>workflow.getCanonicalCourseEvidence(input)));}
}
