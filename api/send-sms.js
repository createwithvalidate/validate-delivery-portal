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

function authToken(request) {
  const header = request.headers.authorization || request.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function compact(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizePhone(value = "") {
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function supabaseFetch(path, { token, serviceRole = false, method = "GET", body, prefer } = {}) {
  const key = serviceRole ? supabaseServiceRoleKey : supabasePublishableKey;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${serviceRole ? supabaseServiceRoleKey : token}`,
  };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || "Supabase request failed";
    throw new Error(message);
  }
  return data || [];
}

async function getUser(token) {
  return supabaseFetch("/auth/v1/user", { token });
}

async function getRows(table, params) {
  return supabaseFetch(`/rest/v1/${table}?${params.toString()}`, { serviceRole: true });
}

function buildSmsBody(payload) {
  const projectName = compact(payload.projectName || "your Validate project");
  const videoTitle = compact(payload.videoTitle || "Latest cut");
  const versionLabel = compact(payload.versionLabel || "New version");
  const versionNote = compact(payload.versionNote || "");
  const reviewUrl = compact(payload.reviewUrl);
  const isInvite = payload.smsType === "invite";
  const intro = isInvite
    ? `Validate: ${projectName} has been shared with you.`
    : `Validate: ${versionLabel} is ready for ${projectName}.`;
  const detail = isInvite ? "" : ` ${videoTitle}${versionNote ? ` - ${versionNote}` : ""}`;
  return compact(`${intro}${detail} Open: ${reviewUrl} Reply STOP to opt out.`);
}

async function sendTwilioSms({ to, body }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authTokenValue = process.env.TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";

  if (!accountSid || !authTokenValue || !messagingServiceSid) {
    throw new Error("Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID in Vercel.");
  }

  const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authTokenValue}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      MessagingServiceSid: messagingServiceSid,
      To: to,
      Body: body,
    }),
  });
  const result = await twilioResponse.json().catch(() => ({}));
  if (!twilioResponse.ok) {
    throw new Error(result.message || "Twilio could not send the SMS.");
  }
  return result;
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

  if (!supabaseServiceRoleKey) {
    sendJson(response, 500, { error: "Missing SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    return;
  }

  const token = authToken(request);
  if (!token) {
    sendJson(response, 401, { error: "Sign in again before sending SMS." });
    return;
  }

  let payload;
  try {
    payload = await parseRequestBody(request);
  } catch {
    sendJson(response, 400, { error: "Invalid SMS request." });
    return;
  }

  const clientEmail = String(payload.clientEmail || "").trim().toLowerCase();
  if (!isEmail(clientEmail)) {
    sendJson(response, 400, { error: "Choose a valid client account before sending SMS." });
    return;
  }

  if (!payload.reviewUrl) {
    sendJson(response, 400, { error: "Review link is required before sending SMS." });
    return;
  }

  try {
    const user = await getUser(token);
    const userEmail = String(user?.email || "").toLowerCase();
    const requesterParams = new URLSearchParams({ select: "role,email", id: `eq.${user.id}`, limit: "1" });
    const [requester] = await getRows("profiles", requesterParams);
    const isAdmin = requester?.role === "admin" || userEmail === firstAdminEmail;
    if (!isAdmin) {
      sendJson(response, 403, { error: "Only admins can send client SMS notifications." });
      return;
    }

    const clientParams = new URLSearchParams({
      select: "email,full_name,phone_number,sms_opt_in,sms_opted_out",
      email: `ilike.${clientEmail}`,
      limit: "1",
    });
    const [clientProfile] = await getRows("profiles", clientParams);
    if (!clientProfile) {
      sendJson(response, 404, { error: "Client account was not found." });
      return;
    }

    if (!clientProfile.phone_number || !clientProfile.sms_opt_in || clientProfile.sms_opted_out) {
      sendJson(response, 400, { error: "This client has not enabled SMS notifications." });
      return;
    }

    const to = normalizePhone(clientProfile.phone_number);
    const body = buildSmsBody(payload);
    const result = await sendTwilioSms({ to, body });
    sendJson(response, 200, { ok: true, id: result.sid, to });
  } catch (error) {
    const message = error.message || "SMS could not be sent.";
    const missingColumns = ["phone_number", "sms_opt_in", "sms_opted_out"].some((field) => message.toLowerCase().includes(field));
    sendJson(response, missingColumns ? 500 : 502, {
      error: missingColumns ? "Run the latest schema.sql in Supabase before sending SMS." : message,
    });
  }
};
