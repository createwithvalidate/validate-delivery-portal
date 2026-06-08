const crypto = require("node:crypto");

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
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

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;

  if (!apiKey || !libraryId) {
    sendJson(response, 500, {
      error: "Missing Bunny setup. Add BUNNY_STREAM_API_KEY and BUNNY_STREAM_LIBRARY_ID in Vercel.",
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

  const createResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      AccessKey: apiKey,
    },
    body: JSON.stringify({ title }),
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
    embedUrl: `https://player.mediadelivery.net/embed/${libraryId}/${video.guid}`,
  });
};
