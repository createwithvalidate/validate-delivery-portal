const supabaseUrl = process.env.SUPABASE_URL || "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.end(JSON.stringify(body));
}

function authToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function inFilter(values) {
  return `in.(${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`;
}

async function supabaseFetch(path, headers, timeoutMs = 6500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Supabase request took too long.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message || body?.error_description || body?.error || "Supabase request failed";
    throw new Error(message);
  }
  return body || [];
}

async function getUser(token) {
  return supabaseFetch(
    "/auth/v1/user",
    {
      Accept: "application/json",
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${token}`,
    },
    5000,
  );
}

async function getRows(table, params, token) {
  const restKey = supabaseServiceRoleKey || supabasePublishableKey;
  return supabaseFetch(
    `/rest/v1/${table}?${params.toString()}`,
    {
      Accept: "application/json",
      apikey: restKey,
      Authorization: `Bearer ${supabaseServiceRoleKey || token}`,
    },
    6500,
  );
}

function oneRowParams(table, filters) {
  const params = new URLSearchParams({ select: "*", limit: "1" });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, `eq.${value}`);
  });
  return params;
}

async function getPublicReview(searchParams) {
  if (!supabaseServiceRoleKey) {
    const error = new Error("Missing SUPABASE_SERVICE_ROLE_KEY in Vercel.");
    error.statusCode = 500;
    throw error;
  }

  const mediaId = String(searchParams.get("mediaId") || "").trim();
  const versionId = String(searchParams.get("versionId") || "").trim();
  if (!mediaId) {
    const error = new Error("Missing review link media id.");
    error.statusCode = 400;
    throw error;
  }

  const [media] = await getRows("videos", oneRowParams("videos", { id: mediaId }), "");
  if (!media) {
    const error = new Error("This review link no longer exists.");
    error.statusCode = 404;
    throw error;
  }
  if (media.status === "image") {
    const error = new Error("Image review links are no longer supported.");
    error.statusCode = 404;
    throw error;
  }

  const [project] = await getRows("projects", oneRowParams("projects", { id: media.project_id }), "").catch(() => []);
  const versionParams = new URLSearchParams({
    select: "*",
    video_id: `eq.${media.id}`,
    order: "created_at.desc",
    limit: "1",
  });
  if (versionId) versionParams.set("id", `eq.${versionId}`);
  const [version] = await getRows("video_versions", versionParams, "");

  return {
    media: {
      id: media.id,
      title: media.title,
      type: "video",
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
  if (url.searchParams.get("publicReview") === "1") {
    try {
      sendJson(response, 200, await getPublicReview(url.searchParams));
    } catch (error) {
      sendJson(response, error.statusCode || 502, { error: error.message || "Review link could not load." });
    }
    return;
  }

  const token = authToken(request);
  if (!token) {
    sendJson(response, 401, { error: "Sign in again before loading the dashboard." });
    return;
  }

  try {
    const user = await getUser(token);
    const email = String(user?.email || "").toLowerCase();
    if (!email) {
      sendJson(response, 401, { error: "Could not verify client email." });
      return;
    }

    const accessParams = new URLSearchParams({
      select: "project_id,email",
      email: `ilike.${email}`,
      order: "granted_at.desc",
    });
    const accessRows = await getRows("project_access", accessParams, token);
    const projectIds = [...new Set(accessRows.map((row) => row.project_id).filter(Boolean))];

    let clients = [];
    let projects = [];
    let videos = [];
    let versions = [];
    let comments = [];

    if (projectIds.length) {
      const projectParams = new URLSearchParams({
        select: "*",
        id: inFilter(projectIds),
        order: "created_at.desc",
      });
      projects = await getRows("projects", projectParams, token);

      const clientIds = [...new Set(projects.map((row) => row.client_id).filter(Boolean))];
      if (clientIds.length) {
        const clientParams = new URLSearchParams({
          select: "*",
          id: inFilter(clientIds),
          order: "created_at.desc",
        });
        clients = await getRows("clients", clientParams, token).catch(() => []);
      }

      const videoParams = new URLSearchParams({
        select: "*",
        project_id: inFilter(projectIds),
        order: "created_at.desc",
      });
      videos = await getRows("videos", videoParams, token);

      const videoIds = [...new Set(videos.map((row) => row.id).filter(Boolean))];
      if (videoIds.length) {
        const versionParams = new URLSearchParams({
          select: "*",
          video_id: inFilter(videoIds),
          order: "created_at.desc",
        });
        versions = await getRows("video_versions", versionParams, token);

        const versionIds = [...new Set(versions.map((row) => row.id).filter(Boolean))];
        if (versionIds.length) {
          const commentParams = new URLSearchParams({
            select: "*",
            version_id: inFilter(versionIds),
            order: "created_at.desc",
          });
          comments = await getRows("comments", commentParams, token);
        }
      }
    }

    sendJson(response, 200, {
      clients,
      projects,
      videos,
      versions,
      comments,
      deliveredProjectIds: projectIds,
      meta: {
        email,
        usingServiceRole: Boolean(supabaseServiceRoleKey),
        accessCount: accessRows.length,
        projectCount: projects.length,
        videoCount: videos.length,
        versionCount: versions.length,
      },
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Client dashboard could not load." });
  }
};
