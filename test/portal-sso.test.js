const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createSupabaseSession,
  signHandoff,
  verifyPortalHandoff,
} = require("../api/_portal-sso.js");

const secret = "test-delivery-handoff-secret-at-least-32-characters";

function handoff(overrides = {}) {
  const now = Date.now();
  const claims = {
    iss: "validate-portal",
    aud: "validate-delivery-portal",
    sub: "admin",
    iat: now,
    exp: now + 60_000,
    jti: "one-time-id",
    ...overrides,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { payload, signature: signHandoff(payload, secret), now, claims };
}

test("accepts a valid short-lived main portal handoff", () => {
  const signed = handoff();
  assert.deepEqual(
    verifyPortalHandoff(signed.payload, signed.signature, secret, signed.now),
    signed.claims,
  );
});

test("rejects a handoff with the wrong audience", () => {
  const signed = handoff({ aud: "somewhere-else" });
  assert.throws(
    () => verifyPortalHandoff(signed.payload, signed.signature, secret, signed.now),
    /expired or is invalid/,
  );
});

test("rejects an expired or modified handoff", () => {
  const expired = handoff({ exp: Date.now() - 1 });
  assert.throws(
    () => verifyPortalHandoff(expired.payload, expired.signature, secret),
    /expired or is invalid/,
  );
  assert.throws(
    () => verifyPortalHandoff(`${expired.payload}x`, expired.signature, secret),
    /could not be verified/,
  );
});

test("exchanges the handoff for a Supabase session without exposing the service key", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    if (url.endsWith("/admin/generate_link")) {
      return Response.json({
        hashed_token: "single-use-token",
        verification_type: "magiclink",
      });
    }
    return Response.json({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      user: { email: "henry@createwithvalidate.com" },
    });
  };

  const session = await createSupabaseSession({
    supabaseUrl: "https://project.supabase.co",
    publishableKey: "publishable-key",
    serviceRoleKey: "service-role-key",
    deliveryEmail: "henry@createwithvalidate.com",
  }, fetchImpl);

  assert.equal(session.accessToken, "access-token");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.type, "magiclink");
  assert.equal(requests[1].body.type, "magiclink");
  assert.equal(requests[1].body.token_hash, "single-use-token");
  assert.equal(requests[1].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.headers.apikey, "publishable-key");
});
