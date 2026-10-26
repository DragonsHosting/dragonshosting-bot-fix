const test = require('node:test');
const assert = require('node:assert/strict');
const { createOAuthState, consumeOAuthState, normalizeRoleIds } = require('./authSecurity');

test('OAuth state is random, bound to a session, single use, and expires', () => {
  const first = createOAuthState();
  const second = createOAuthState();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);

  const session = { oauthState: first, oauthStateCreatedAt: 1_000 };
  assert.equal(consumeOAuthState(session, 'wrong', 1_001), false);
  assert.equal(session.oauthState, undefined);

  const validSession = { oauthState: first, oauthStateCreatedAt: 1_000 };
  assert.equal(consumeOAuthState(validSession, first, 1_001), true);
  assert.equal(consumeOAuthState(validSession, first, 1_002), false);

  const expiredSession = { oauthState: first, oauthStateCreatedAt: 1_000 };
  assert.equal(consumeOAuthState(expiredSession, first, 601_001), false);
});

test('role allow-lists keep only valid Discord role IDs and remove duplicates', () => {
  const exampleRoleId = '1234567890' + '1234567';
  assert.deepEqual(
    normalizeRoleIds([exampleRoleId, 'ROLE_ID', '0', exampleRoleId]),
    [exampleRoleId]
  );
  assert.deepEqual(normalizeRoleIds(`${exampleRoleId}, ROLE_ID, 0`), [exampleRoleId]);
});
