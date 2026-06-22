const crypto = require("node:crypto");

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
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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
    throw makeHttpError(401, "Sign in again before uploading a video.");
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
    throw makeHttpError(403, "Only admins can upload videos.");
  }

  return user;
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256(value, encoding = "hex") {
  return crypto.createHash("sha256").update(value, "utf8").digest(encoding);
}

function encodePathPart(value = "") {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function cleanPart(value = "", fallback = "untitled") {
  const cleaned = String(value || "")
    .trim()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return cleaned || fallback;
}

function extensionFromFileName(fileName = "") {
  const match = String(fileName).match(/\.([a-z0-9]{2,8})$/i);
  return match ? match[1].toLowerCase() : "mp4";
}

function signedS3PutUrl({ bucket, region, accessKeyId, secretAccessKey, sessionToken, key, contentType }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = `/${key.split("/").map(encodePathPart).join("/")}`;
  const signedHeaders = "content-type;host";
  const params = new URLSearchParams({
    "X-Amz-Algorithm": algorithm,
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": "3600",
    "X-Amz-SignedHeaders": signedHeaders,
  });
  if (sessionToken) params.set("X-Amz-Security-Token", sessionToken);
  params.sort();

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    params.toString(),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [algorithm, amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service),
    "aws4_request",
  );
  const signature = hmac(signingKey, stringToSign, "hex");
  params.set("X-Amz-Signature", signature);

  return `https://${host}${canonicalUri}?${params.toString()}`;
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

  try {
    await requireAdmin(request);
  } catch (error) {
    sendJson(response, error.statusCode || 502, { error: error.message || "Upload is not allowed." });
    return;
  }

  const bucket = process.env.AWS_S3_BUCKET || "";
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  const sessionToken = process.env.AWS_SESSION_TOKEN || "";
  const publicBaseUrl = String(process.env.AWS_S3_PUBLIC_BASE_URL || "").replace(/\/+$/, "");

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    sendJson(response, 500, {
      error: "Missing AWS setup. Add AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in Vercel.",
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

  const contentType = String(payload.contentType || "video/mp4").slice(0, 120);
  const fileName = cleanPart(payload.fileName || payload.title || "final-cut", "final-cut");
  const projectPart = cleanPart(payload.projectTitle || "project", "project");
  const titlePart = cleanPart(payload.title || fileName, "final-cut");
  const extension = extensionFromFileName(payload.fileName || fileName);
  const keyPrefix = String(process.env.AWS_S3_KEY_PREFIX || "final-cuts").replace(/^\/+|\/+$/g, "");
  const key = `${keyPrefix}/${projectPart}/${Date.now()}-${titlePart}.${extension}`;
  const uploadUrl = signedS3PutUrl({
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    key,
    contentType,
  });
  const publicUrl = publicBaseUrl
    ? `${publicBaseUrl}/${key.split("/").map(encodePathPart).join("/")}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${key.split("/").map(encodePathPart).join("/")}`;

  sendJson(response, 200, {
    provider: "AWS S3",
    key,
    uploadUrl,
    publicUrl,
    embedUrl: publicUrl,
    contentType,
  });
};
