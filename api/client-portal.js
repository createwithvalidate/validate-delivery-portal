const supabaseUrl = process.env.SUPABASE_URL || "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";

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

async function supabaseFetch(path, token) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message || body?.error_description || body?.error || "Supabase request failed";
    throw new Error(message);
  }
  return body || [];
}

async function getUser(token) {
  return supabaseFetch("/auth/v1/user", token);
}

async function getRows(table, params, token) {
  return supabaseFetch(`/rest/v1/${table}?${params.toString()}`, token);
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
    });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Client dashboard could not load." });
  }
};
