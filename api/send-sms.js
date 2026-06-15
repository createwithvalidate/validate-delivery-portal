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

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
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

async function getAuthUsers() {
  const result = await supabaseFetch("/auth/v1/admin/users?per_page=1000", { serviceRole: true });
  return Array.isArray(result?.users) ? result.users : [];
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

async function sendTwilioSms({ to, body, statusCallbackUrl = "" }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authTokenValue = process.env.TWILIO_AUTH_TOKEN || "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";

  if (!accountSid || !authTokenValue || !messagingServiceSid) {
    throw new Error("Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_MESSAGING_SERVICE_SID in Vercel.");
  }

  const requestBody = new URLSearchParams({
    MessagingServiceSid: messagingServiceSid,
    To: to,
    Body: body,
  });
  if (statusCallbackUrl) requestBody.set("StatusCallback", statusCallbackUrl);

  const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authTokenValue}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: requestBody,
  });
  const result = await twilioResponse.json().catch(() => ({}));
  if (!twilioResponse.ok) {
    throw new Error(result.message || "Twilio could not send the SMS.");
  }
  return result;
}

function requestOrigin(request) {
  const host = request.headers["x-forwarded-host"] || request.headers.host || "";
  if (!host) return "";
  const proto = request.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
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
    let clientProfile;
    try {
      [clientProfile] = await getRows("profiles", clientParams);
    } catch (error) {
      const message = error.message?.toLowerCase?.() || "";
      if (!["phone_number", "sms_opt_in", "sms_opted_out"].some((field) => message.includes(field))) {
        throw error;
      }
      const fallbackParams = new URLSearchParams({
        select: "email,full_name",
        email: `ilike.${clientEmail}`,
        limit: "1",
      });
      [clientProfile] = await getRows("profiles", fallbackParams);
    }

    const authUsers = await getAuthUsers().catch(() => []);
    const authUser = authUsers.find((item) => normalizeEmail(item.email) === clientEmail);
    if (!clientProfile && !authUser) {
      sendJson(response, 404, { error: "Client account was not found." });
      return;
    }

    const phoneNumber = normalizePhone(clientProfile?.phone_number || authUser?.user_metadata?.phone_number || "");
    const smsOptIn = Boolean(clientProfile?.sms_opt_in || authUser?.user_metadata?.sms_opt_in);
    const smsOptedOut = Boolean(clientProfile?.sms_opted_out);

    if (!phoneNumber || !smsOptIn || smsOptedOut) {
      sendJson(response, 400, { error: "This client has not enabled SMS notifications." });
      return;
    }

    const to = phoneNumber;
    const body = buildSmsBody(payload);
    const result = await sendTwilioSms({
      to,
      body,
      statusCallbackUrl: `${requestOrigin(request)}/api/twilio-status`,
    });
    console.info("Twilio SMS accepted", {
      sid: result.sid,
      status: result.status,
      toLast4: String(to).slice(-4),
    });
    sendJson(response, 200, { ok: true, id: result.sid, status: result.status, to });
  } catch (error) {
    const message = error.message || "SMS could not be sent.";
    const missingColumns = ["phone_number", "sms_opt_in", "sms_opted_out"].some((field) => message.toLowerCase().includes(field));
    console.error("SMS send failed", { message });
    sendJson(response, missingColumns ? 500 : 502, {
      error: missingColumns ? "Run the latest schema.sql in Supabase before sending SMS." : message,
    });
  }
};
