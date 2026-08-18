const PUBLIC_DELIVERY_ORIGIN = "https://createwithvalidate.com";
const PUBLIC_DELIVERY_PREFIX = "/delivery";
const PROXY_HEADER = "X-Validate-Delivery-Proxy";

export function publicDeliveryRedirect(request) {
  const url = new URL(request.url);
  const isPagesOrigin = url.hostname === "validate-delivery-portal.pages.dev" ||
    url.hostname.endsWith(".validate-delivery-portal.pages.dev");
  if (!isPagesOrigin || request.headers.get(PROXY_HEADER) === "1") return null;

  const publicUrl = new URL(PUBLIC_DELIVERY_ORIGIN);
  publicUrl.pathname = `${PUBLIC_DELIVERY_PREFIX}${url.pathname === "/" ? "/" : url.pathname}`;
  publicUrl.search = url.search;
  return publicUrl;
}
