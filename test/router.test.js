const assert = require("node:assert/strict");
const { test } = require("node:test");

async function loadRouter() {
  return import("../router/worker.mjs");
}

async function loadOriginRedirect() {
  return import("../functions/_delivery-origin.mjs");
}

test("redirects the bare delivery path to its trailing-slash URL", async () => {
  const { handleDeliveryRequest } = await loadRouter();
  const response = await handleDeliveryRequest(new Request("https://createwithvalidate.com/delivery"));

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://createwithvalidate.com/delivery/");
});

test("proxies delivery assets and APIs to the Pages origin", async () => {
  const { handleDeliveryRequest } = await loadRouter();
  let upstreamRequest;
  const response = await handleDeliveryRequest(
    new Request("https://createwithvalidate.com/delivery/api/public-config?fresh=1", {
      headers: { Origin: "https://createwithvalidate.com" },
    }),
    async (url, init) => {
      upstreamRequest = { url, init };
      return Response.json({ ok: true });
    },
  );

  assert.equal(upstreamRequest.url, "https://validate-delivery-portal.pages.dev/api/public-config?fresh=1");
  assert.equal(upstreamRequest.init.headers.get("X-Forwarded-Host"), "createwithvalidate.com");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Validate-Delivery-Route"), "createwithvalidate.com/delivery");
});

test("rewrites Pages-origin redirects back onto the Validate delivery path", async () => {
  const { handleDeliveryRequest } = await loadRouter();
  const response = await handleDeliveryRequest(
    new Request("https://createwithvalidate.com/delivery/start"),
    async () => new Response(null, {
      status: 302,
      headers: { Location: "https://validate-delivery-portal.pages.dev/next?ready=1" },
    }),
  );

  assert.equal(response.headers.get("location"), "https://createwithvalidate.com/delivery/next?ready=1");
});

test("does not proxy paths outside the delivery mount", async () => {
  const { handleDeliveryRequest } = await loadRouter();
  const response = await handleDeliveryRequest(new Request("https://createwithvalidate.com/portal/"));
  assert.equal(response.status, 404);
});

test("redirects the public Pages origin to the first-party delivery path", async () => {
  const { publicDeliveryRedirect } = await loadOriginRedirect();
  const redirectUrl = publicDeliveryRedirect(
    new Request("https://validate-delivery-portal.pages.dev/api/public-config?fresh=1"),
  );

  assert.equal(
    redirectUrl.toString(),
    "https://createwithvalidate.com/delivery/api/public-config?fresh=1",
  );
});

test("allows trusted router requests to reach the Pages origin", async () => {
  const { publicDeliveryRedirect } = await loadOriginRedirect();
  const redirectUrl = publicDeliveryRedirect(
    new Request("https://validate-delivery-portal.pages.dev/api/public-config", {
      headers: { "X-Validate-Delivery-Proxy": "1" },
    }),
  );

  assert.equal(redirectUrl, null);
});
