const crypto = require("node:crypto");

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
