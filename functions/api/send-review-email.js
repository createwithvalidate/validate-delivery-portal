import { runVercelHandler } from "../_adapter.js";

export function onRequest(context) {
  return runVercelHandler(() => import("../../api/send-review-email.js"), context);
}
