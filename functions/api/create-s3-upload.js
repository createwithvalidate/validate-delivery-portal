import { runVercelHandler } from "../_adapter.js";

export function onRequest(context) {
  return runVercelHandler(() => import("../../api/create-s3-upload.js"), context);
}
