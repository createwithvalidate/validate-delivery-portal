import { runVercelHandler } from "../_adapter.js";

export function onRequest(context) {
  return runVercelHandler(() => import("../../api/public-config.js"), context);
}
