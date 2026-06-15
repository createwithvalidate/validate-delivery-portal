function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

  if (!accessToken) {
    sendJson(response, 500, {
      error: "Missing Vimeo setup. Add VIMEO_ACCESS_TOKEN in Vercel.",
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
