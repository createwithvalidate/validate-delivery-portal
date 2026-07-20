const fallbackSupabaseUrl = "https://axvnifoamejuxxqhezwr.supabase.co";
const fallbackSupabasePublishableKey = "sb_publishable_IFOVI5nvp8DdOeqAs4lNsg__Iewd4BN";

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

module.exports = function handler(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  sendJson(response, 200, {
    supabaseUrl: process.env.SUPABASE_URL || fallbackSupabaseUrl,
    supabasePublishableKey:
      process.env.SUPABASE_PUBLISHABLE_KEY || fallbackSupabasePublishableKey,
  });
};
