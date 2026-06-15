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

  if (!Number.isFinite(size) || size <= 0) {
    sendJson(response, 400, { error: "Vimeo needs the video file size before upload." });
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
  });
};
