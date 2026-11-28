import {CredentialsController} from './credentials.controller';
import {CompletionEvidenceController} from './completion-evidence.controller';
import {NativeClassOutcomesController} from './native-class-outcomes.controller';
import {LearnerEvidenceController} from './learner-evidence.controller';
import {CompletionAdminController} from './completion-admin.controller';
import {KnowledgeCheckController} from './knowledge-check.controller';
import {SurveysController} from './surveys.controller';
/** Compose with the existing singleton identity service and global default-deny guard. */
export const assessmentsOutcomesControllers=[CredentialsController,CompletionEvidenceController,NativeClassOutcomesController,LearnerEvidenceController,CompletionAdminController,KnowledgeCheckController,SurveysController];
