const { createSupabaseSession, verifyPortalHandoff } = require("./_portal-sso.js");

const firstAdminEmail = "henry@createwithvalidate.com";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.end(JSON.stringify(body));
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function header(request, name) {
  return request.headers[name] || request.headers[name.toLowerCase()] || "";
}

function isSameOriginRequest(request) {
  const secFetchSite = String(header(request, "Sec-Fetch-Site")).toLowerCase();
  if (secFetchSite && !["same-origin", "none"].includes(secFetchSite)) return false;

  const origin = header(request, "Origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const host = header(request, "X-Forwarded-Host") || header(request, "Host");
    return Boolean(host && originUrl.host === host);
  } catch {
    return false;
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  if (!isSameOriginRequest(request)) {
    sendJson(response, 403, { error: "Cross-origin handoff requests are not allowed." });
    return;
  }

  let body;
  try {
    body = await parseRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Portal handoff request is invalid." });
    return;
  }

  try {
    verifyPortalHandoff(
      String(body.payload || ""),
      String(body.signature || ""),
      process.env.PORTAL_DELIVERY_SSO_SECRET || "",
    );
    const session = await createSupabaseSession({
      supabaseUrl: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      deliveryEmail: process.env.DELIVERY_SSO_EMAIL || firstAdminEmail,
    });

    sendJson(response, 200, { success: true, session });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    console.error("Delivery Portal SSO exchange failed", {
      statusCode,
      message: error.message || "Unknown SSO error",
    });
    const publicMessage = statusCode >= 500
      ? "Delivery Portal SSO is temporarily unavailable. You can still sign in directly."
      : error.message;
    sendJson(response, statusCode, { error: publicMessage });
  }
};
