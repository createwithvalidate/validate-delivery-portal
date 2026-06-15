const crypto = require("node:crypto");

const supabaseUrl = process.env.SUPABASE_URL || "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const firstAdminEmail = "henry@createwithvalidate.com";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.end(JSON.stringify(body));
}

function authToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function supabaseFetch(path, { token, serviceRole = false, method = "GET", body, prefer } = {}) {
  const key = serviceRole ? supabaseServiceRoleKey : supabasePublishableKey;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${serviceRole ? supabaseServiceRoleKey : token}`,
  };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || "Supabase request failed";
    throw new Error(message);
  }
  return data || [];
}

async function getUser(token) {
  return supabaseFetch("/auth/v1/user", { token });
}

async function getRows(table, params) {
  return supabaseFetch(`/rest/v1/${table}?${params.toString()}`, { serviceRole: true });
}

function makeInviteCode(role) {
  const suffix = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `VALIDATE-${role.toUpperCase()}-${suffix}`;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (!supabaseServiceRoleKey) {
    sendJson(response, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    return;
  }

  const token = authToken(request);
  if (!token) {
    sendJson(response, 401, { error: "Sign in again before creating an invite." });
    return;
  }

  let payload;
  try {
    payload = await parseRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Invalid invite request." });
    return;
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const role = payload.role === "admin" ? "admin" : "client";
  if (!isEmail(email)) {
    sendJson(response, 400, { error: "A valid invite email is required." });
    return;
  }

  try {
    const user = await getUser(token);
    const userEmail = String(user?.email || "").toLowerCase();
    const profileParams = new URLSearchParams({
      select: "role,email",
      id: `eq.${user.id}`,
      limit: "1",
    });
    const [profile] = await getRows("profiles", profileParams);
    const isAdmin = profile?.role === "admin" || userEmail === firstAdminEmail;
    if (!isAdmin) {
      sendJson(response, 403, { error: "Only admins can generate invite codes." });
      return;
    }

    await supabaseFetch("/rest/v1/invites?code=in.(VALIDATE-ADMIN-BETA,VALIDATE-CLIENT-BETA)", {
      serviceRole: true,
      method: "DELETE",
      prefer: "return=minimal",
    }).catch((cleanupError) => {
      console.warn("Old beta invite cleanup failed", cleanupError);
    });

    const code = makeInviteCode(role);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const [invite] = await supabaseFetch("/rest/v1/invites", {
      serviceRole: true,
      method: "POST",
      prefer: "return=representation",
      body: {
        email,
        code,
        role,
        expires_at: expiresAt,
        accepted_by: null,
        accepted_at: null,
      },
    });

    sendJson(response, 200, {
      ok: true,
      code: invite?.code || code,
      email,
      role,
      expiresAt: invite?.expires_at || expiresAt,
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Invite code could not be created." });
  }
};
