import { runVercelHandler } from "../_adapter.js";

export function onRequest(context) {
  return runVercelHandler(() => import("../../api/create-vimeo-upload.js"), context);
}
