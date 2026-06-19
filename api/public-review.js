const supabaseUrl = process.env.SUPABASE_URL || "https://axvnifoamejuxxqhezwr.supabase.co";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.end(JSON.stringify(body));
}

async function supabaseFetch(path) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || "Supabase request failed";
    throw new Error(message);
  }
  return data || [];
}

function oneRowParams(table, filters) {
  const params = new URLSearchParams({ select: "*", limit: "1" });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, `eq.${value}`);
  });
  return `/rest/v1/${table}?${params.toString()}`;
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

  if (!supabaseServiceRoleKey) {
    sendJson(response, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    return;
  }

  const url = new URL(request.url, "http://localhost");
  const mediaId = String(url.searchParams.get("mediaId") || "").trim();
  const versionId = String(url.searchParams.get("versionId") || "").trim();

  if (!mediaId) {
    sendJson(response, 400, { error: "Missing review link media id." });
    return;
  }

  try {
    const [media] = await supabaseFetch(oneRowParams("videos", { id: mediaId }));
    if (!media) {
      sendJson(response, 404, { error: "This review link no longer exists." });
      return;
    }

    const [project] = await supabaseFetch(oneRowParams("projects", { id: media.project_id })).catch(() => []);
    let version = null;
    if (media.status !== "image") {
      const versionParams = new URLSearchParams({
        select: "*",
        video_id: `eq.${media.id}`,
        order: "created_at.desc",
        limit: "1",
      });
      if (versionId) versionParams.set("id", `eq.${versionId}`);
      [version] = await supabaseFetch(`/rest/v1/video_versions?${versionParams.toString()}`);
    }

    sendJson(response, 200, {
      media: {
        id: media.id,
        title: media.title,
        type: media.status === "image" ? "image" : "video",
        imageUrl: media.due || "",
      },
      project: project
        ? {
            id: project.id,
            name: project.name,
          }
        : null,
      version: version
        ? {
            id: version.id,
            label: version.label,
            provider: version.provider || "Video",
            embedUrl: version.embed_url || "",
            bunnyVideoId: version.bunny_video_id || "",
          }
        : null,
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Review link could not load." });
  }
};
