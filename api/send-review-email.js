const resendEndpoint = "https://api.resend.com/emails";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.end(JSON.stringify(body));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function buildEmailHtml(payload) {
  const clientName = escapeHtml(payload.clientName || "there");
  const projectName = escapeHtml(payload.projectName || "your project");
  const videoTitle = escapeHtml(payload.videoTitle || "Latest cut");
  const versionLabel = escapeHtml(payload.versionLabel || "New version");
  const versionNote = escapeHtml(payload.versionNote || "A new review version is ready.");
  const reviewUrl = escapeHtml(payload.reviewUrl);

  return `
    <div style="background:#090909;color:#f8f8f4;font-family:Arial,sans-serif;padding:32px;">
      <div style="max-width:640px;margin:0 auto;">
        <p style="letter-spacing:0.18em;text-transform:uppercase;color:#bdbdb8;font-size:12px;">
          Validate review portal
        </p>
        <h1 style="font-size:34px;line-height:1;margin:0 0 18px;">
          ${versionLabel} is ready for review.
        </h1>
        <p style="font-size:16px;line-height:1.6;color:#deded9;">
          Hi ${clientName}, a new cut for <strong>${projectName}</strong> is ready.
        </p>
        <div style="border:1px solid #343434;border-radius:12px;padding:20px;margin:24px 0;background:#131313;">
          <p style="margin:0 0 8px;color:#aaa;">Video</p>
          <h2 style="margin:0 0 14px;font-size:22px;">${videoTitle}</h2>
          <p style="margin:0;color:#deded9;line-height:1.6;">${versionNote}</p>
        </div>
        <a href="${reviewUrl}" style="display:inline-block;background:#f8f8f4;color:#090909;text-decoration:none;font-weight:700;border-radius:8px;padding:14px 18px;">
          Open review
        </a>
        <p style="font-size:13px;color:#8f8f8a;margin-top:28px;line-height:1.5;">
          If the button does not work, paste this link into your browser:<br />
          <span style="color:#cfcfca;">${reviewUrl}</span>
        </p>
      </div>
    </div>
  `;
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

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.PORTAL_FROM_EMAIL;
  const replyToEmail = process.env.PORTAL_REPLY_TO_EMAIL;

  if (!apiKey || !fromEmail) {
    sendJson(response, 500, {
      error: "Missing Resend setup. Add RESEND_API_KEY and PORTAL_FROM_EMAIL in Vercel.",
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

  if (!isEmail(payload.clientEmail)) {
    sendJson(response, 400, { error: "Client email is required" });
    return;
  }

  if (!payload.reviewUrl) {
    sendJson(response, 400, { error: "Review URL is required" });
    return;
  }

  const emailPayload = {
    from: fromEmail,
    to: [payload.clientEmail],
    subject: `${payload.videoTitle || "New video"} is ready for review`,
    html: buildEmailHtml(payload),
  };

  if (replyToEmail) emailPayload.reply_to = replyToEmail;

  const resendResponse = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload),
  });

  const result = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    sendJson(response, resendResponse.status, {
      error: result.message || "Resend could not send the email",
      details: result,
    });
    return;
  }

  sendJson(response, 200, { ok: true, id: result.id });
};
