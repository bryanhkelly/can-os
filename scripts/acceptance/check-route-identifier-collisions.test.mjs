import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { routeIdentifierKey, findRouteIdentifierCollisions } from './check-route-identifier-collisions.mjs';

test('catches the Cloudflare noncredit completion route collision', () => {
  const original = 'src/routes/canonical_.noncredit-completion.tsx';
  const second = 'src/routes/canonical.noncredit.completion.tsx';
  assert.equal(routeIdentifierKey(original), routeIdentifierKey(second));
  assert.deepEqual(findRouteIdentifierCollisions([original, second]), [{
    identifier: 'canonicalnoncreditcompletion', first: original, second,
  }]);
});

test('allows the renamed noncredit queue and separate correction page', () => {
  assert.deepEqual(findRouteIdentifierCollisions([
    'src/routes/canonical_.noncredit-review-queue.tsx',
    'src/routes/canonical.noncredit.completion.tsx',
    'src/routes/canonical.classes_.completion.tsx',
  ]), []);
});

test('normalizes path separators and file extensions', () => {
  assert.equal(routeIdentifierKey('src\\routes\\canonical_.noncredit-completion.ts'),
    'canonicalnoncreditcompletion');
});
