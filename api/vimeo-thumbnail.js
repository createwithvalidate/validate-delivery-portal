function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
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

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const accessToken = process.env.VIMEO_ACCESS_TOKEN;
  const requestUrl = new URL(request.url || "", "http://localhost");
  const videoId = String(request.query?.videoId || requestUrl.searchParams.get("videoId") || "").replace(/[^0-9]/g, "");

  if (!videoId) {
    sendJson(response, 400, { error: "Missing Vimeo video ID" });
    return;
  }

  if (!accessToken) {
    sendJson(response, 500, { error: "Missing Vimeo setup" });
    return;
  }

  const vimeoResponse = await fetch(`https://api.vimeo.com/videos/${videoId}`, {
    headers: {
      Accept: "application/vnd.vimeo.*+json;version=3.4",
      Authorization: `bearer ${accessToken}`,
    },
  });
  const video = await vimeoResponse.json().catch(() => ({}));

  if (!vimeoResponse.ok) {
    sendJson(response, vimeoResponse.status || 502, {
      error: video.error || video.message || "Vimeo thumbnail could not load",
    });
    return;
  }

  const thumbnailUrl = bestVimeoThumbnail(video);
  if (!thumbnailUrl) {
    sendJson(response, 404, { error: "Vimeo thumbnail is not ready yet" });
    return;
  }

  response.statusCode = 302;
  response.setHeader("Cache-Control", "public, max-age=60");
  response.setHeader("Location", thumbnailUrl);
  response.end();
};
