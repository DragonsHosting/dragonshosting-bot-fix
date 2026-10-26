const crypto = require('crypto');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function createOAuthState() {
  return crypto.randomBytes(32).toString('hex');
}

function consumeOAuthState(session, suppliedState, now = Date.now()) {
  if (!session || typeof session.oauthState !== 'string') return false;

  const expectedState = session.oauthState;
  const createdAt = Number(session.oauthStateCreatedAt);
  delete session.oauthState;
  delete session.oauthStateCreatedAt;

  if (!Number.isFinite(createdAt) || now - createdAt > OAUTH_STATE_TTL_MS) return false;
  if (typeof suppliedState !== 'string' || !/^[a-f0-9]{64}$/i.test(suppliedState)) return false;

  const expected = Buffer.from(expectedState, 'utf8');
  const actual = Buffer.from(suppliedState, 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function normalizeRoleIds(values) {
  const candidates = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(',')
      : [];

  return [...new Set(candidates
    .map(value => String(value || '').trim())
    .filter(value => /^\d{17,20}$/.test(value)))];
}

module.exports = { createOAuthState, consumeOAuthState, normalizeRoleIds };
