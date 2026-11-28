import {HttpCode,applyDecorators} from '@nestjs/common';
import {ApiCookieAuth,ApiHeader,ApiResponse} from '@nestjs/swagger';
import {GovernedWorkflowOperation} from './security';
import {problemOpenApiSchema} from './contracts';
export function Operation(method:'GET'|'POST'){return applyDecorators(GovernedWorkflowOperation('canonical',method),ApiCookieAuth('session'),...(method==='POST'?[HttpCode(200),ApiHeader({name:'Origin',required:true})]:[]),...[400,401,403,409,413,415,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
export function LearnerRead(){return applyDecorators(GovernedWorkflowOperation('learner','GET'),ApiCookieAuth('session'),...[400,401,403,409,500,503].map(status=>ApiResponse({status,content:{'application/problem+json':{schema:problemOpenApiSchema}}})));}
