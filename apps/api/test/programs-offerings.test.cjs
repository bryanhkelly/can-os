const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApi, readConfig } = require('../dist/bootstrap');
const { CanonicalIdentityService } = require('../dist/identity.service');
const { ProgramsOfferingsModule } = require('../dist/programs-offerings.module');
const { CatalogController } = require('../dist/catalog.controller');
const { WorkflowController } = require('../dist/workflow.controller');
const { OfferingReleaseController } = require('../dist/platform-commands.controller');
const { NoncreditPublicationController } = require('../dist/noncredit-publication.controller');

test('WS04 registers its controllers once and shares the configured identity service', async () => {
  const { app, document } = await createApi(readConfig({ API_DOCS: '0' }));
  try {
    const domain = app.select(ProgramsOfferingsModule);
    const identity = app.get(CanonicalIdentityService);
    for (const Controller of [CatalogController, WorkflowController, OfferingReleaseController, NoncreditPublicationController]) {
      const instance = domain.get(Controller, { strict: true });
      assert.equal(instance.identity, identity);
    }
    const ids = Object.values(document.paths).flatMap(path =>
      Object.values(path).filter(operation => operation?.operationId).map(operation => operation.operationId));
    assert.equal(ids.length, new Set(ids).size, 'operationIds must be unique');
    for (const id of [
      'exploreCanonicalBlueprintReferences', 'discoverCanonicalBlueprintOfferings',
      'readCanonicalBlueprintWorkspace', 'listCanonicalBlueprintReviews', 'listCanonicalBlueprintReviewEvidence',
      'createCanonicalBlueprintConfiguration', 'saveCanonicalBlueprintConfiguration',
      'submitCanonicalBlueprintConfiguration', 'decideCanonicalBlueprintReview',
      'executeCanonicalBlueprintConfiguration', 'recordNativeDeploymentReadiness',
      'placeNativeDeploymentSite', 'approveNativeOfferingAdoption', 'getBlueprintConfiguration',
      'getBlueprintReview', 'getBlueprintReviewHistory', 'getBlueprintPlanningContext',
      'listOfferingAdoptionReviewQueue', 'getExactOfferingReviewContent', 'listReleaseReviewQueue',
      'getReleaseOverview', 'getReleasePolicy', 'submitRelease', 'saveReleasePolicy', 'decideRelease',
      'publishCourses', 'approveAssetManifest', 'publishOffering', 'getNoncreditEnrollmentPublisher',
      'getNoncreditTrainingReadiness', 'publishNoncreditSelfEnrollment', 'closeNoncreditSelfEnrollment',
      'publishNoncreditAcrossAuthorizedSites'
    ]) {
      assert.ok(ids.includes(id), 'Missing WS04 operation: ' + id);
    }
  } finally {
    await app.close();
  }
});
