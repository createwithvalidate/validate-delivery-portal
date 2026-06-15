function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (typeof request.body === "string") return request.body;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
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

  const rawBody = await readBody(request).catch(() => "");
  const params = new URLSearchParams(rawBody);
  const sid = params.get("MessageSid") || params.get("SmsSid") || "";
  const status = params.get("MessageStatus") || params.get("SmsStatus") || "";
  const errorCode = params.get("ErrorCode") || "";
  const to = params.get("To") || "";

  console.info("Twilio SMS status", {
    sid,
    status,
    errorCode: errorCode || null,
    toLast4: String(to).slice(-4),
  });

  sendJson(response, 200, { ok: true });
};
