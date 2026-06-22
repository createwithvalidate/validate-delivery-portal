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
  const isInvite = payload.emailType === "invite";
  const isDownload = payload.emailType === "download";
  const headline = isInvite
    ? `${projectName} has been added to your review dashboard.`
    : isDownload
      ? `Final downloads are ready for ${projectName}.`
      : `${versionLabel} is ready for review.`;
  const intro = isInvite
    ? `Hi ${clientName}, ${escapeHtml(payload.senderName || "Validate")} invited you to review <strong>${projectName}</strong>.`
    : isDownload
      ? `Hi ${clientName}, final download files are ready for <strong>${projectName}</strong>.`
      : `Hi ${clientName}, a new cut for <strong>${projectName}</strong> is ready.`;
  const actionLabel = isInvite ? "Open project" : isDownload ? "Open downloads" : "Open review";
  const eyebrow = isInvite ? "Project invite" : isDownload ? "Downloads ready" : "New review version";
  const detailLabel = isInvite ? "Project" : isDownload ? "Downloads" : "Video";

  return `
    <div style="margin:0;background:#060607;color:#fbfbfb;font-family:Inter,Arial,sans-serif;padding:0;">
      <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
        ${headline}
      </div>
      <div style="padding:36px 18px;">
        <div style="max-width:620px;margin:0 auto;border:1px solid #262628;border-radius:14px;background:#111113;overflow:hidden;">
          <div style="padding:28px 28px 18px;border-bottom:1px solid #262628;background:linear-gradient(135deg,#18181a,#0d0d0e);">
            <div style="font-size:28px;font-weight:900;letter-spacing:0.04em;color:#fbfbfb;">
              VALIDATE
            </div>
            <p style="margin:16px 0 0;letter-spacing:0.18em;text-transform:uppercase;color:#a6a6a1;font-size:11px;font-weight:800;">
              ${eyebrow}
            </p>
            <h1 style="font-size:34px;line-height:1.02;margin:10px 0 0;color:#fbfbfb;">
              ${headline}
            </h1>
          </div>

          <div style="padding:28px;">
            <p style="font-size:16px;line-height:1.65;color:#d9d9d5;margin:0 0 22px;">
              ${intro}
            </p>

            <div style="border:1px solid #303033;border-radius:10px;padding:18px;margin:0 0 24px;background:#171719;">
              <p style="margin:0 0 7px;color:#9d9d98;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:800;">${detailLabel}</p>
              <h2 style="margin:0 0 12px;font-size:22px;line-height:1.1;color:#fbfbfb;">${videoTitle}</h2>
              <p style="margin:0;color:#d9d9d5;line-height:1.6;">${versionNote}</p>
            </div>

            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;">
              <tr>
                <td bgcolor="#fbfbfb" style="border-radius:9px;text-align:center;">
                  <a
                    href="${reviewUrl}"
                    target="_blank"
                    style="background:#fbfbfb;border:1px solid #fbfbfb;border-radius:9px;color:#050506;display:block;font-size:16px;font-weight:800;line-height:1;text-decoration:none;padding:16px 22px;"
                  >
                    ${actionLabel}
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#8f8f8a;margin:24px 0 0;line-height:1.5;">
              If the button does not work, paste this link into your browser:<br />
              <a href="${reviewUrl}" target="_blank" style="color:#fbfbfb;text-decoration:underline;word-break:break-all;">${reviewUrl}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildEmailText(payload) {
  const clientName = payload.clientName || "there";
  const projectName = payload.projectName || "your project";
  const videoTitle = payload.videoTitle || "Latest cut";
  const versionLabel = payload.versionLabel || "New version";
  const versionNote = payload.versionNote || "A new review version is ready.";
  const isInvite = payload.emailType === "invite";
  const isDownload = payload.emailType === "download";

  return [
    `Hi ${clientName},`,
    "",
    isInvite
      ? `${projectName} has been added to your review dashboard.`
      : isDownload
        ? `Final downloads are ready for ${projectName}.`
        : `${versionLabel} is ready for review.`,
    `Project: ${projectName}`,
    isInvite ? "" : isDownload ? `Downloads: ${videoTitle}` : `Video: ${videoTitle}`,
    "",
    versionNote,
    "",
    `${isInvite ? "Open project" : isDownload ? "Open downloads" : "Open review"}: ${payload.reviewUrl}`,
  ].filter((line) => line !== "").join("\n");
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
    subject:
      payload.emailType === "invite"
        ? `${payload.projectName || "A project"} was added to your Validate dashboard`
        : payload.emailType === "download"
          ? `Downloads are ready for ${payload.projectName || "your project"}`
        : `${payload.videoTitle || "New video"} is ready for review`,
    html: buildEmailHtml(payload),
    text: buildEmailText(payload),
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
