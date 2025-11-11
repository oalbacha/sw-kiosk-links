import { getStore } from "@netlify/blobs";

const API_KEY = Netlify.env.get("MY_API_KEY") || "";

// Verify Netlify Identity JWT token
async function verifyIdentityToken(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.substring(7);

  // For Edge Functions, we can check if context.identity is available
  // If not, we'll verify by checking the token with Netlify Identity
  try {
    // Get the site URL to construct the identity endpoint
    const url = new URL(request.url);
    const siteUrl = `${url.protocol}//${url.host}`;
    const identityUrl = `${siteUrl}/.netlify/identity/user`;

    const response = await fetch(identityUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch (e) {
    console.error("Identity verification error:", e);
    return false;
  }
}

// Check authentication (API key or Netlify Identity)
async function isAuthenticated(request, context) {
  // Check API key first (for Tauri app)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && apiKey === API_KEY) {
    return true;
  }

  // Check Netlify Identity (for web dashboard)
  // Try context first (if available)
  if (context?.identity?.user) {
    return true;
  }

  // Otherwise verify the JWT token
  return await verifyIdentityToken(request);
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
    const authenticated = await isAuthenticated(request, context);
    if (!authenticated) {
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
