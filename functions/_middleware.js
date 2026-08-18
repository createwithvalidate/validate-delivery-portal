import { publicDeliveryRedirect } from "./_delivery-origin.mjs";

export function onRequest({ request, next }) {
  const redirectUrl = publicDeliveryRedirect(request);
  if (redirectUrl) return Response.redirect(redirectUrl.toString(), 308);
  return next();
}
