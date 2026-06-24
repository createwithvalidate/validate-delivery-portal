const supabaseUrl = process.env.SUPABASE_URL || "https://axvnifoamejuxxqhezwr.supabase.co";
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";
const maxZipBytes = Number(process.env.DOWNLOAD_ZIP_MAX_BYTES || 250 * 1024 * 1024);

let crcTable = null;

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

async function requireUser(request) {
  const token = authToken(request);
  if (!token) throw new Error("Sign in again before downloading files.");

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Accept: "application/json",
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userResponse.ok) throw new Error("Sign in again before downloading files.");
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body !== "string") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function sanitizeName(value, fallback) {
  return (
    String(value || fallback)
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || fallback
  );
}

function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return private172 ? Number(private172[1]) >= 16 && Number(private172[1]) <= 31 : false;
}

function safeDownloadUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Download URL is not valid.");
  if (isPrivateHost(url.hostname)) throw new Error("Download URL is not allowed.");
  return url;
}

function crc32(data) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let current = index;
      for (let bit = 0; bit < 8; bit += 1) {
        current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
      }
      crcTable[index] = current >>> 0;
    }
  }

  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = crcTable[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function makeZipBuffer(files) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;

  files.forEach((file) => {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const checksum = crc32(data);
    const header = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
    ]);

    chunks.push(header, name, data);
    centralDirectory.push({ name, checksum, size: data.length, offset });
    offset += header.length + name.length + data.length;
  });

  const centralOffset = offset;
  centralDirectory.forEach((entry) => {
    const header = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(entry.checksum),
      uint32(entry.size),
      uint32(entry.size),
      uint16(entry.name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(entry.offset),
    ]);
    chunks.push(header, entry.name);
    offset += header.length + entry.name.length;
  });

  const centralSize = offset - centralOffset;
  chunks.push(
    Buffer.concat([
      uint32(0x06054b50),
      uint16(0),
      uint16(0),
      uint16(centralDirectory.length),
      uint16(centralDirectory.length),
      uint32(centralSize),
      uint32(centralOffset),
      uint16(0),
    ]),
  );

  return Buffer.concat(chunks);
}

async function fetchDownloadFile(file, index) {
  const url = safeDownloadUrl(file.url);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Could not fetch ${file.fileName || `file ${index + 1}`}.`);

  const data = Buffer.from(await response.arrayBuffer());
  return {
    name: sanitizeName(file.fileName, `download-${index + 1}.mp4`),
    data,
  };
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
    await requireUser(request);
    const body = await parseRequestBody(request);
    const files = Array.isArray(body.files) ? body.files.slice(0, 12) : [];
    if (!files.length) throw new Error("No download files were selected.");

    const downloaded = [];
    let totalBytes = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = await fetchDownloadFile(files[index], index);
      totalBytes += file.data.length;
      if (totalBytes > maxZipBytes) {
        throw new Error("These files are too large to package automatically.");
      }
      downloaded.push(file);
    }

    const zip = makeZipBuffer(downloaded);
    const projectName = sanitizeName(body.projectName, "validate-downloads")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const fileName = `${projectName || "validate-downloads"}-final-files.zip`;

    response.statusCode = 200;
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Length", String(zip.length));
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.end(zip);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Download zip could not be created." });
  }
};
