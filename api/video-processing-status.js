function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.end(JSON.stringify(body));
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
