const crypto = require("node:crypto");

const handoffIssuer = "validate-portal";
const handoffAudience = "validate-delivery-portal";
const maxHandoffLifetimeMs = 90 * 1000;
const clockSkewMs = 10 * 1000;

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function base64UrlDecodeJson(value) {
  const decoded = Buffer.from(String(value), "base64url").toString("utf8");
  return JSON.parse(decoded);
}

function signHandoff(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(received, expected) {
  const receivedBuffer = Buffer.from(String(received));
  const expectedBuffer = Buffer.from(String(expected));
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function verifyPortalHandoff(payload, signature, secret, now = Date.now()) {
  if (!secret || secret.length < 32) {
    throw Object.assign(new Error("Delivery Portal handoff is not configured."), { statusCode: 503 });
  }
  if (!payload || !signature || payload.length > 4096 || signature.length > 256) {
    throw Object.assign(new Error("Portal handoff is invalid."), { statusCode: 400 });
  }

  const expectedSignature = signHandoff(payload, secret);
  if (!signaturesMatch(signature, expectedSignature)) {
    throw Object.assign(new Error("Portal handoff could not be verified."), { statusCode: 401 });
  }

  let claims;
  try {
    claims = base64UrlDecodeJson(payload);
  } catch {
    throw Object.assign(new Error("Portal handoff is invalid."), { statusCode: 400 });
  }

  const issuedAt = Number(claims.iat);
  const expiresAt = Number(claims.exp);
  const validClaims =
    claims.iss === handoffIssuer &&
    claims.aud === handoffAudience &&
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.jti === "string" &&
    claims.jti.length > 0 &&
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    issuedAt <= now + clockSkewMs &&
    expiresAt > now &&
    expiresAt - issuedAt > 0 &&
    expiresAt - issuedAt <= maxHandoffLifetimeMs;

  if (!validClaims) {
    throw Object.assign(new Error("Portal handoff has expired or is invalid."), { statusCode: 401 });
  }

  return claims;
}

async function readJson(response) {
  return response.json().catch(() => null);
}

async function supabaseRequest(url, options, fetchImpl = fetch) {
  const response = await fetchImpl(url, options);
  const body = await readJson(response);
  if (!response.ok) {
    const message = body?.message || body?.msg || body?.error_description || body?.error || "Supabase request failed.";
    throw Object.assign(new Error(message), { statusCode: 502 });
  }
  return body || {};
}

async function createSupabaseSession(config, fetchImpl = fetch) {
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const publishableKey = String(config.publishableKey || "");
  const serviceRoleKey = String(config.serviceRoleKey || "");
  const deliveryEmail = normalizeEmail(config.deliveryEmail);

  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !deliveryEmail) {
    throw Object.assign(new Error("Delivery Portal SSO is not fully configured."), { statusCode: 503 });
  }

  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  const generated = await supabaseRequest(
    `${supabaseUrl}/auth/v1/admin/generate_link`,
    {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        type: "magiclink",
        email: deliveryEmail,
        data: { portal_sso: true },
      }),
    },
    fetchImpl,
  );
  const properties = generated.properties || generated.data?.properties || generated;
  const tokenHash = properties.hashed_token || properties.hashedToken;
  if (!tokenHash) {
    throw Object.assign(new Error("Supabase did not create a Delivery Portal sign-in token."), { statusCode: 502 });
  }

  const verificationType = properties.verification_type || properties.verificationType || "magiclink";
  const verified = await supabaseRequest(
    `${supabaseUrl}/auth/v1/verify`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: publishableKey,
      },
      body: JSON.stringify({ token_hash: tokenHash, type: verificationType }),
    },
    fetchImpl,
  );

  if (
    !verified.access_token ||
    !verified.refresh_token ||
    normalizeEmail(verified.user?.email) !== deliveryEmail
  ) {
    throw Object.assign(new Error("Supabase did not return the configured Delivery Portal account."), {
      statusCode: 502,
    });
  }

  return {
    accessToken: verified.access_token,
    refreshToken: verified.refresh_token,
    expiresIn: verified.expires_in,
    expiresAt: verified.expires_at,
  };
}

module.exports = {
  createSupabaseSession,
  signHandoff,
  verifyPortalHandoff,
};
