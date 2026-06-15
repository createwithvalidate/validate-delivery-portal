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
    throw makeHttpError(500, "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  }

  const token = authToken(request);
  if (!token) {
    throw makeHttpError(401, "Sign in again before checking video processing.");
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
    throw makeHttpError(403, "Only admins can check video processing.");
  }

  return user;
}

function providerName(value = "") {
  return String(value).toLowerCase().includes("vimeo") ? "Vimeo" : "Bunny Stream";
}

function bunnyReady(video = {}) {
  const status = video.status;
  const statusText = String(status || "").toLowerCase();
  const progress = Number(video.encodeProgress || video.encode_progress || 0);
  return status === 4 || statusText === "finished" || progress >= 100;
}

function bunnyFailed(video = {}) {
  const status = video.status;
  const statusText = String(status || "").toLowerCase();
  return status === 5 || status === 6 || statusText.includes("error") || statusText.includes("failed");
}

async function getBunnyStatus(videoId) {
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  if (!apiKey || !libraryId) {
    return { ready: false, status: "missing_setup", progress: 0, message: "Missing Bunny setup." };
  }

  const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`, {
    headers: {
      Accept: "application/json",
      AccessKey: apiKey,
    },
  });
  const video = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ready: false,
      error: true,
      status: "error",
      progress: 0,
      message: video.message || "Bunny processing status could not be loaded.",
    };
  }

  const progress = Math.max(0, Math.min(100, Number(video.encodeProgress || 0)));
  return {
    ready: bunnyReady(video),
    error: bunnyFailed(video),
    status: String(video.status ?? "processing"),
    progress,
    message: bunnyReady(video) ? "Bunny video is ready." : `Bunny is processing the video${progress ? ` (${progress}%)` : ""}.`,
  };
}

async function getVimeoStatus(videoId) {
  const accessToken = process.env.VIMEO_ACCESS_TOKEN;
  if (!accessToken) {
    return { ready: false, status: "missing_setup", progress: 0, message: "Missing Vimeo setup." };
  }

  const response = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
    headers: {
      Accept: "application/vnd.vimeo.*+json;version=3.4",
      Authorization: `bearer ${accessToken}`,
    },
  });
  const video = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ready: false,
      error: true,
      status: "error",
      progress: 0,
      message: video.error || video.message || "Vimeo processing status could not be loaded.",
    };
  }

  const transcodeStatus = video.transcode?.status || video.status || "processing";
  const ready = transcodeStatus === "complete" || video.status === "available";
  const failed = transcodeStatus === "error";
  return {
    ready,
    error: failed,
    status: transcodeStatus,
    progress: ready ? 100 : 0,
    message: ready ? "Vimeo video is ready." : "Vimeo is still transcoding the video.",
  };
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

  try {
    await requireAdmin(request);
  } catch (error) {
    sendJson(response, error.statusCode || 502, { error: error.message || "Processing status is not available." });
    return;
  }

  const url = new URL(request.url, "http://localhost");
  const provider = providerName(url.searchParams.get("provider"));
  const videoId = String(url.searchParams.get("videoId") || "").trim();
  if (!videoId) {
    sendJson(response, 400, { error: "Video ID is required." });
    return;
  }

  try {
    const status = provider === "Vimeo" ? await getVimeoStatus(videoId) : await getBunnyStatus(videoId);
    sendJson(response, 200, { ok: true, provider, videoId, ...status });
  } catch (error) {
    sendJson(response, 502, {
      error: error.message || "Video processing status could not be checked.",
      provider,
      videoId,
    });
  }
};
