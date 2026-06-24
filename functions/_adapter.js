import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

function installEnvironment(env = {}) {
  globalThis.process ??= {};
  globalThis.process.env = {
    ...(globalThis.process.env || {}),
    ...env,
  };
}

function requestHeadersObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
    result[key.toLowerCase()] = value;
  });
  return result;
}

function createNodeRequest(request, bodyBuffer) {
  const url = new URL(request.url);
  const nodeRequest = Readable.from(bodyBuffer.length ? [bodyBuffer] : []);
  nodeRequest.method = request.method;
  nodeRequest.url = `${url.pathname}${url.search}`;
  nodeRequest.headers = requestHeadersObject(request.headers);
  return nodeRequest;
}

function createNodeResponse() {
  const headers = new Headers();
  const chunks = [];
  let ended = false;
  let resolveEnded;
  const endedPromise = new Promise((resolve) => {
    resolveEnded = resolve;
  });

  const response = {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name, String(value));
    },
    getHeader(name) {
      return headers.get(name);
    },
    write(chunk) {
      if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
    end(chunk) {
      if (chunk !== undefined) this.write(chunk);
      ended = true;
      resolveEnded();
    },
    get ended() {
      return ended;
    },
    async toResponse() {
      if (!ended) await endedPromise;
      return new Response(chunks.length ? Buffer.concat(chunks) : null, {
        status: this.statusCode,
        headers,
      });
    },
  };

  return response;
}

export async function runVercelHandler(moduleLoader, context) {
  installEnvironment(context.env);
  const module = await moduleLoader();
  const handler = module.default || module;
  if (typeof handler !== "function") {
    return Response.json({ error: "API handler is not configured." }, { status: 500 });
  }

  const bodyBuffer =
    context.request.method === "GET" || context.request.method === "HEAD"
      ? Buffer.alloc(0)
      : Buffer.from(await context.request.arrayBuffer());
  const request = createNodeRequest(context.request, bodyBuffer);
  const response = createNodeResponse();

  await handler(request, response);
  return response.toResponse();
}
