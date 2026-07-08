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

function videoIdFromUri(uri = "") {
  const match = String(uri).match(/\/videos\/(\d+)/);
  return match ? match[1] : "";
}

function folderIdFromUri(uri = "") {
  const match = String(uri).match(/\/(?:projects|folders)\/(\d+)/);
  return match ? match[1] : "";
}

function normalizeName(value = "") {
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

function bestVimeoThumbnail(video = {}) {
  const sizes = Array.isArray(video.pictures?.sizes) ? video.pictures.sizes : [];
  return (
    sizes
      .filter((item) => item.link)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.link ||
    video.pictures?.base_link ||
    ""
  );
}

async function vimeoJson(url, { accessToken, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.vimeo.*+json;version=3.4",
      Authorization: `bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || `Vimeo request failed with status ${response.status}`);
  }
  return data;
}

async function ensureVimeoFolder({ accessToken, projectTitle }) {
  const name = String(projectTitle || "").trim().slice(0, 180);
  if (!name) return null;

  const listUrl = new URL("https://api.vimeo.com/me/projects");
  listUrl.searchParams.set("query", name);
  listUrl.searchParams.set("per_page", "100");
  const list = await vimeoJson(listUrl, { accessToken });
  const match = (list.data || []).find((item) => normalizeName(item.name) === normalizeName(name));
  if (match?.uri) return match;

  return vimeoJson("https://api.vimeo.com/me/projects", {
    accessToken,
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

  const accessToken = process.env.VIMEO_ACCESS_TOKEN;

  try {
    await requireAdmin(request);
  } catch (error) {
    sendJson(response, error.statusCode || 502, { error: error.message || "Upload is not allowed." });
    return;
  }

  if (!accessToken) {
    sendJson(response, 500, {
      error: "Missing Vimeo setup. Add VIMEO_ACCESS_TOKEN in Cloudflare.",
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
  const size = Number(payload.size || 0);
  let folder = null;

  if (!Number.isFinite(size) || size <= 0) {
    sendJson(response, 400, { error: "Vimeo needs the video file size before upload." });
    return;
  }

  try {
    folder = await ensureVimeoFolder({
      accessToken,
      projectTitle: payload.projectTitle,
    });
  } catch (error) {
    sendJson(response, 502, {
      error: `Vimeo could not prepare the project folder: ${error.message}`,
    });
    return;
  }

  const createResponse = await fetch("https://api.vimeo.com/me/videos", {
    method: "POST",
    headers: {
      Accept: "application/vnd.vimeo.*+json;version=3.4",
      Authorization: `bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: title,
      ...(folder?.uri ? { folder_uri: folder.uri } : {}),
      privacy: {
        // Vimeo "Private" requires Vimeo account access. Unlisted stays off public Vimeo
        // surfaces while still allowing client review embeds to play in the portal.
        view: "unlisted",
      },
      upload: {
        approach: "tus",
        size: String(size),
      },
    }),
  });

  const video = await createResponse.json().catch(() => ({}));
  const videoId = videoIdFromUri(video.uri);
  const uploadLink = video.upload?.upload_link || "";

  if (!createResponse.ok || !videoId || !uploadLink) {
    sendJson(response, createResponse.status || 502, {
      error: video.error || video.message || "Vimeo could not create the upload.",
      details: video,
    });
    return;
  }

  sendJson(response, 200, {
    videoId,
    uploadLink,
    embedUrl: video.player_embed_url || `https://player.vimeo.com/video/${videoId}`,
    uri: video.uri,
    thumbnailUrl: bestVimeoThumbnail(video),
    folderId: folderIdFromUri(folder?.uri),
    folderUri: folder?.uri || "",
    folderName: folder?.name || "",
  });
};
