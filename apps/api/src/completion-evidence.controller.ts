import {Controller,Get,Post,Body,Query,Req} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiBody,ApiOkResponse,ApiQuery} from '@nestjs/swagger';
import type {FastifyRequest} from 'fastify';
import {verifiedWorkflow} from './security';
import {CanonicalIdentityService} from './identity.service';
import {validated} from './learning.contracts';
import * as c from './credentials.contracts';
import {Operation} from './assessments-outcomes-operation';
@ApiTags('Completion evidence review')
@Controller()
export class CompletionEvidenceController {
 constructor(private readonly identity:CanonicalIdentityService){}
 @Post('completion-evidence-review-requests')
 @Operation('POST')
 @ApiOperation({operationId:'requestCompletionEvidenceReview',summary:'Request an independent review of exact source-bound completion evidence'})
 @ApiBody({schema:c.evidenceDocs.request})
 @ApiOkResponse({schema:c.evidenceDocs.requested})
 async requestCompletionEvidenceReview(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.evidenceRequest,body);return c.requested.parse(await this.identity.runWorkflow(()=>workflow.requestCompletionEvidenceReview(input)));}
 @Get('completion-evidence-review-queue')
 @Operation('GET')
 @ApiOperation({operationId:'getPendingCompletionEvidenceReviews',summary:'Read exact-Site pending evidence requests excluding own submissions'})
 @ApiQuery({name:'page',schema:{type:'integer',minimum:0,maximum:100,default:0},required:false})
 @ApiOkResponse({schema:c.evidenceDocs.queue})
 async getPendingCompletionEvidenceReviews(@Req() req:FastifyRequest,@Query() query:unknown){const workflow=verifiedWorkflow(req),input=validated(c.evidenceQueue,query);return c.queueResult.parse(await this.identity.runWorkflow(()=>workflow.getPendingCompletionEvidenceReviews(input)));}
 @Post('completion-evidence-review-decisions')
 @Operation('POST')
 @ApiOperation({operationId:'decideCompletionEvidenceReview',summary:'Approve or reject independently reviewed evidence'})
 @ApiBody({schema:c.evidenceDocs.decision})
 @ApiOkResponse({schema:c.evidenceDocs.decided})
 async decideCompletionEvidenceReview(@Req() req:FastifyRequest,@Body() body:unknown){const workflow=verifiedWorkflow(req),input=validated(c.evidenceDecision,body);return c.decided.parse(await this.identity.runWorkflow(()=>workflow.decideCompletionEvidenceReview(input)));}
}
