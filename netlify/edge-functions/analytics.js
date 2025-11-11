import { getStore } from "@netlify/blobs";

const API_KEY = Netlify.env.get("MY_API_KEY") || "";

// Check authentication (API key or Netlify Identity)
function isAuthenticated(request, context) {
  // Check API key first (for Tauri app)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && apiKey === API_KEY) {
    return true;
  }

  // Check Netlify Identity (for web dashboard)
  // Netlify Edge Functions automatically verify JWT tokens and provide user in context
  // Check if user is authenticated via Identity
  if (context?.identity?.user) {
    return true;
  }

  // Also check for Authorization header - Edge Functions should verify it automatically
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    // If there's a Bearer token, Edge Functions should have verified it
    // and populated context.identity. If not, we'll still check context
    // This is a fallback - context.identity should be the primary check
    return context?.identity?.user !== undefined;
  }

  return false;
}

export default async (request, context) => {
  const store = getStore("analytics-store");

  if (request.method === "POST") {
    // POST requires API key (for Tauri tracking)
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || apiKey !== API_KEY) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { linkId } = await request.json();
    if (!linkId) {
      return new Response("linkId is required", { status: 400 });
    }
    let count = (await store.get(linkId)) || 0;
    await store.set(linkId, count + 1);
    return new Response("OK");
  } else if (request.method === "GET") {
    // GET requires authentication (API key or Netlify Identity)
    const authenticated = isAuthenticated(request, context);
    if (!authenticated) {
      // Log for debugging
      console.log("Auth check failed:", {
        hasApiKey: !!request.headers.get("x-api-key"),
        hasAuthHeader: !!request.headers.get("authorization"),
        hasContextIdentity: !!context?.identity?.user,
      });
      return new Response("Unauthorized", { status: 401 });
    }

    const allData = await store.list();
    const analytics = {};
    for (const entry of allData.entries) {
      const count = await store.get(entry.key);
      analytics[entry.key] = parseInt(count) || 0;
    }
    return Response.json(analytics);
  }

  return new Response("Method not allowed", { status: 405 });
};
