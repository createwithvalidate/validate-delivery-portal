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

function makeHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function authToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function supabaseFetch(path, { token, serviceRole = false } = {}) {
  const key = serviceRole ? supabaseServiceRoleKey : supabasePublishableKey;
  const supabaseResponse = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      apikey: key,
      Authorization: `Bearer ${serviceRole ? supabaseServiceRoleKey : token}`,
    },
  });
  const data = await supabaseResponse.json().catch(() => null);
  if (!supabaseResponse.ok) {
    const message = data?.message || data?.error_description || data?.error || "Supabase request failed";
    throw makeHttpError(supabaseResponse.status, message);
  }
  return data || [];
}

async function getUser(token) {
  return supabaseFetch("/auth/v1/user", { token });
}

async function getRows(table, params) {
  return supabaseFetch(`/rest/v1/${table}?${params.toString()}`, { serviceRole: true });
}

async function requireAdmin(request) {
  if (!supabaseServiceRoleKey) {
    throw makeHttpError(500, "Missing SUPABASE_SERVICE_ROLE_KEY in Cloudflare.");
  }

  const token = authToken(request);
  if (!token) {
    throw makeHttpError(401, "Sign in again before uploading a video.");
  }

  const user = await getUser(token);
  const userEmail = String(user?.email || "").toLowerCase();
  if (!user?.id || !userEmail) {
    throw makeHttpError(401, "Could not verify this admin account.");
  }

  const profileParams = new URLSearchParams({
    select: "role,email",
    id: `eq.${user.id}`,
    limit: "1",
  });
  const [profile] = await getRows("profiles", profileParams);
  const isAdmin = profile?.role === "admin" || userEmail === firstAdminEmail;
  if (!isAdmin) {
    throw makeHttpError(403, "Only admins can upload videos.");
  }

  return user;
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function normalizeName(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

async function bunnyJson(url, { apiKey, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      AccessKey: apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || `Bunny request failed with status ${response.status}`);
  }
  return data;
}

async function ensureBunnyCollection({ apiKey, libraryId, projectTitle }) {
  const name = String(projectTitle || "").trim().slice(0, 180);
  if (!name) return null;

  const listUrl = new URL(`https://video.bunnycdn.com/library/${libraryId}/collections`);
  listUrl.searchParams.set("page", "1");
  listUrl.searchParams.set("itemsPerPage", "100");
  listUrl.searchParams.set("search", name);
  const list = await bunnyJson(listUrl, { apiKey });
  const match = (list.items || []).find((item) => normalizeName(item.name) === normalizeName(name));
  if (match?.guid) return match;

  return bunnyJson(`https://video.bunnycdn.com/library/${libraryId}/collections`, {
    apiKey,
    method: "POST",
    body: { name },
  });
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

  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;

  try {
    await requireAdmin(request);
  } catch (error) {
    sendJson(response, error.statusCode || 502, { error: error.message || "Upload is not allowed." });
    return;
  }

  if (!apiKey || !libraryId) {
    sendJson(response, 500, {
      error: "Missing Bunny setup. Add BUNNY_STREAM_API_KEY and BUNNY_STREAM_LIBRARY_ID in Cloudflare.",
    });
    return;
  }

  let payload;
  try {
    payload = await parseRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }

  const title = String(payload.title || "Untitled video").slice(0, 180);
  let collection = null;

  try {
    collection = await ensureBunnyCollection({
      apiKey,
      libraryId,
      projectTitle: payload.projectTitle,
    });
  } catch (error) {
    sendJson(response, 502, {
      error: `Bunny could not prepare the project collection: ${error.message}`,
    });
    return;
  }

  const createResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      AccessKey: apiKey,
    },
    body: JSON.stringify({
      title,
      ...(collection?.guid ? { collectionId: collection.guid } : {}),
    }),
  });

  const video = await createResponse.json().catch(() => ({}));

  if (!createResponse.ok || !video.guid) {
    sendJson(response, createResponse.status || 502, {
      error: video.message || "Bunny could not create the video",
      details: video,
    });
    return;
  }

  const expirationTime = Math.floor(Date.now() / 1000) + 86400;
  const signature = crypto
    .createHash("sha256")
    .update(`${libraryId}${apiKey}${expirationTime}${video.guid}`)
    .digest("hex");

  sendJson(response, 200, {
    videoId: video.guid,
    libraryId,
    expirationTime,
    signature,
    endpoint: "https://video.bunnycdn.com/tusupload",
    embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${video.guid}`,
    collectionId: collection?.guid || "",
    collectionName: collection?.name || "",
  });
};
