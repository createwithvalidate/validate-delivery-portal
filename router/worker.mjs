const DELIVERY_PREFIX = "/delivery";
const DELIVERY_ORIGIN = "https://validate-delivery-portal.pages.dev";

export async function handleDeliveryRequest(request, fetchImpl = fetch) {
  const incomingUrl = new URL(request.url);

  if (incomingUrl.pathname === DELIVERY_PREFIX) {
    incomingUrl.pathname = `${DELIVERY_PREFIX}/`;
    return Response.redirect(incomingUrl.toString(), 308);
  }

  if (!incomingUrl.pathname.startsWith(`${DELIVERY_PREFIX}/`)) {
    return new Response("Not found", { status: 404 });
  }

  const originUrl = new URL(DELIVERY_ORIGIN);
  originUrl.pathname = incomingUrl.pathname.slice(DELIVERY_PREFIX.length) || "/";
  originUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("Host");
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set("X-Validate-Delivery-Proxy", "1");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
    init.body = request.body;
  }

  const upstream = await fetchImpl(originUrl.toString(), init);
  const responseHeaders = new Headers(upstream.headers);
  const locationHeader = responseHeaders.get("Location");
  if (locationHeader) {
    const rewrittenLocation = rewriteLocation(locationHeader, incomingUrl.origin);
    if (rewrittenLocation) responseHeaders.set("Location", rewrittenLocation);
  }

  responseHeaders.set("X-Robots-Tag", "noindex, nofollow");
  responseHeaders.set("X-Validate-Delivery-Route", "createwithvalidate.com/delivery");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

function rewriteLocation(locationValue, publicOrigin) {
  try {
    const locationUrl = new URL(locationValue, DELIVERY_ORIGIN);
    if (locationUrl.origin !== DELIVERY_ORIGIN) return locationValue;
    return `${publicOrigin}${DELIVERY_PREFIX}${locationUrl.pathname}${locationUrl.search}${locationUrl.hash}`;
  } catch {
    return locationValue;
  }
}

export default {
  fetch(request) {
    return handleDeliveryRequest(request);
  },
};
