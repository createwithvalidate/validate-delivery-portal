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
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.end(JSON.stringify(body));
}

function authToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function supabaseFetch(path, { token, serviceRole = false } = {}) {
  const key = serviceRole ? supabaseServiceRoleKey : supabasePublishableKey;
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      apikey: key,
      Authorization: `Bearer ${serviceRole ? supabaseServiceRoleKey : token}`,
    },
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

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const token = authToken(request);
  if (!token) {
    sendJson(response, 401, { error: "Sign in again before loading client accounts." });
    return;
  }

  if (!supabaseServiceRoleKey) {
    sendJson(response, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    return;
  }

  try {
    const user = await getUser(token);
    const userEmail = String(user?.email || "").toLowerCase();
    if (!user?.id || !userEmail) {
      sendJson(response, 401, { error: "Could not verify this admin account." });
      return;
    }

    const profileParams = new URLSearchParams({
      select: "id,email,full_name,role",
      id: `eq.${user.id}`,
      limit: "1",
    });
    const [profile] = await getRows("profiles", profileParams);
    const isAdmin = profile?.role === "admin" || userEmail === firstAdminEmail;
    if (!isAdmin) {
      sendJson(response, 403, { error: "Only admins can view client accounts." });
      return;
    }

    const accountParams = new URLSearchParams({
      select: "id,email,full_name,role,created_at",
      role: "eq.client",
      order: "created_at.desc",
    });
    const accounts = await getRows("profiles", accountParams);

    sendJson(response, 200, {
      accounts: accounts.map((account) => ({
        id: account.id,
        email: account.email,
        fullName: account.full_name || account.email,
        role: account.role,
        createdAt: account.created_at,
      })),
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Client accounts could not load." });
  }
};
