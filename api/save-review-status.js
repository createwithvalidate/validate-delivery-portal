const supabaseUrl = process.env.SUPABASE_URL || "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const reviewEventPrefix = "__validate_review_event__:";

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

function slug(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function reviewEventId(type, versionId, email) {
  return `review-${type}-${slug(versionId).slice(0, 48)}-${slug(email).slice(0, 72)}`;
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
    sendJson(response, 401, { error: "Sign in again before saving review status." });
    return;
  }

  let payload;
  try {
    payload = await parseRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Invalid review status request." });
    return;
  }

  const versionId = String(payload.versionId || "").trim();
  const type = String(payload.type || "").trim();
  if (!versionId || !["seen", "approved"].includes(type)) {
    sendJson(response, 400, { error: "Review status needs a version and valid status." });
    return;
  }

  try {
    const user = await getUser(token);
    const email = String(user?.email || "").toLowerCase();
    if (!email) {
      sendJson(response, 401, { error: "Could not verify this client account." });
      return;
    }

    const profileParams = new URLSearchParams({ select: "role,full_name,email", id: `eq.${user.id}`, limit: "1" });
    const [profile] = await getRows("profiles", profileParams);
    if (profile?.role === "admin") {
      sendJson(response, 403, { error: "Admins can view status, but clients approve versions." });
      return;
    }

    const versionParams = new URLSearchParams({ select: "id,video_id", id: `eq.${versionId}`, limit: "1" });
    const [version] = await getRows("video_versions", versionParams);
    if (!version?.video_id) {
      sendJson(response, 404, { error: "Version was not found." });
      return;
    }

    const videoParams = new URLSearchParams({ select: "id,project_id", id: `eq.${version.video_id}`, limit: "1" });
    const [video] = await getRows("videos", videoParams);
    if (!video?.project_id) {
      sendJson(response, 404, { error: "Video was not found." });
      return;
    }

    const accessParams = new URLSearchParams({
      select: "project_id,email",
      project_id: `eq.${video.project_id}`,
      email: `ilike.${email}`,
      limit: "1",
    });
    const [access] = await getRows("project_access", accessParams);
    if (!access) {
      sendJson(response, 403, { error: "This project is not available for your account." });
      return;
    }

    const name = String(profile?.full_name || user.user_metadata?.full_name || email);
    const eventTime = new Date().toISOString();
    const comment = {
      id: reviewEventId(type, versionId, email),
      version_id: versionId,
      author: name,
      role: "client",
      body: `${reviewEventPrefix}${JSON.stringify({
        type,
        email,
        name,
        at: eventTime,
      })}`,
      created_at_label: type === "seen" ? "Seen just now" : "Approved just now",
    };

    const [savedComment] = await supabaseFetch("/rest/v1/comments?on_conflict=id", {
      serviceRole: true,
      method: "POST",
      body: comment,
      prefer: "resolution=merge-duplicates,return=representation",
    });

    if (type === "approved") {
      await supabaseFetch(`/rest/v1/video_versions?id=eq.${encodeURIComponent(versionId)}`, {
        serviceRole: true,
        method: "PATCH",
        body: { approved: true },
        prefer: "return=minimal",
      });
    }

    sendJson(response, 200, {
      ok: true,
      comment: {
        id: savedComment?.id || comment.id,
        versionId,
        author: savedComment?.author || comment.author,
        role: "client",
        body: savedComment?.body || comment.body,
        createdAt: savedComment?.created_at_label || comment.created_at_label,
      },
      approved: type === "approved",
    });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Review status did not save." });
  }
};
