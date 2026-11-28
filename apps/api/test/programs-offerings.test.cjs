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

test('WS04 configuration and review GETs reject caller-supplied authority or unexpected query fields', async () => {
  const { app } = await createApi(readConfig({ API_DOCS: '0' }));
  const id = '00000000-0000-4000-8000-000000000001';
  const identity = app.get(CanonicalIdentityService);
  let calls = 0;
  // Stub only the in-process identity port. Production routing and the default-deny
  // guard are unchanged; real session/RLS acceptance is a separate mandatory gate.
  identity.authenticateWorkflow = async (_request, mode, method) => {
    assert.equal(mode, 'planning');
    assert.equal(method, 'GET');
    return {
      readCanonicalBlueprintConfiguration: async () => { calls++; throw new Error('must not dispatch'); },
      readCanonicalBlueprintReview: async () => { calls++; throw new Error('must not dispatch'); },
    };
  };
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    for (const path of [
      '/api/v1/blueprint-configurations/' + id,
      '/api/v1/blueprint-configuration-versions/' + id + '/review'
    ]) {
      const response = await fetch(url + path + '?actorPersonId=' + id);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'VALIDATION_FAILED');
    }
    assert.equal(calls, 0);
  } finally {
    await app.close();
  }
});
