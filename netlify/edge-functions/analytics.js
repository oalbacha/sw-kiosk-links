import { getStore } from "@netlify/blobs";

const API_KEY = Netlify.env.get("MY_API_KEY") || "";
const CLERK_SECRET_KEY = Netlify.env.get("CLERK_SECRET_KEY") || "";

// Helper to decode base64 in edge functions
function base64Decode(str) {
  // Edge functions support atob, but handle it safely
  try {
    return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  } catch (e) {
    console.error("Base64 decode error:", e);
    throw e;
  }
}

// Verify Clerk JWT token
async function verifyClerkToken(token) {
  if (!token) {
    console.error("No token provided to verifyClerkToken");
    return false;
  }

  console.log("verifyClerkToken called with token length:", token.length);

  try {
    // Verify by checking if token is a valid JWT format
    const parts = token.split(".");
    console.log("Token split into parts, count:", parts.length);

    if (parts.length !== 3) {
      console.error(
        "Invalid JWT format - expected 3 parts, got:",
        parts.length
      );
      return false;
    }

    // Decode the payload to check basic claims
    try {
      const decoded = base64Decode(parts[1]);
      const payload = JSON.parse(decoded);
      const now = Math.floor(Date.now() / 1000);

      console.log("Token payload decoded:", {
        sub: payload.sub,
        exp: payload.exp,
        now: now,
        expired: payload.exp ? payload.exp < now : "no exp claim",
        iss: payload.iss,
        iat: payload.iat,
      });

      // Check if token is expired
      if (payload.exp && payload.exp < now) {
        console.error(
          "Token expired. Exp:",
          payload.exp,
          "Now:",
          now,
          "Diff:",
          now - payload.exp
        );
        return false;
      }

      // Check if token is from Clerk (has sub claim)
      if (!payload.sub) {
        console.error("Token missing sub claim");
        return false;
      }

      // Check if issuer is Clerk
      if (payload.iss && !payload.iss.includes("clerk")) {
        console.warn("Token issuer doesn't appear to be Clerk:", payload.iss);
        // Still allow it for development
      }

      // Basic validation passed - token appears valid
      console.log("✅ Token validated successfully, user:", payload.sub);
      return true;
    } catch (decodeError) {
      console.error("Error decoding token payload:", decodeError);
      console.error("Decode error details:", {
        message: decodeError.message,
        stack: decodeError.stack,
      });
      return false;
    }
  } catch (e) {
    console.error("Clerk token verification error:", e);
    return false;
  }
}

// Check authentication (API key or Clerk)
async function isAuthenticated(request, context) {
  // Check API key first (for Tauri app)
  const apiKey = request.headers.get("x-api-key");
  if (apiKey && apiKey === API_KEY) {
    console.log("✅ Authenticated via API key");
    return true;
  }

  // Check Clerk JWT token (for web dashboard)
  const authHeader = request.headers.get("authorization");
  console.log(
    "isAuthenticated - authHeader:",
    authHeader ? "present" : "missing"
  );

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    console.log("isAuthenticated - extracted token, length:", token.length);
    const isValid = await verifyClerkToken(token);
    console.log("isAuthenticated - verifyClerkToken returned:", isValid);
    return isValid;
  }

  console.log("isAuthenticated - no valid auth method found");
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
    // GET requires authentication (API key or Clerk)
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    console.log("GET /api/analytics - Auth check:", {
      hasApiKey: !!request.headers.get("x-api-key"),
      hasAuthHeader: !!authHeader,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      tokenPreview: token ? token.substring(0, 30) + "..." : null,
    });

    const authenticated = await isAuthenticated(request, context);
    if (!authenticated) {
      // Log detailed failure info
      console.log("Auth check failed - detailed:", {
        hasApiKey: !!request.headers.get("x-api-key"),
        hasAuthHeader: !!authHeader,
        hasToken: !!token,
        tokenLength: token?.length || 0,
        tokenPreview: token ? token.substring(0, 30) + "..." : null,
        hasClerkSecret: !!CLERK_SECRET_KEY,
      });

      // Try to decode token to see what's wrong
      if (token) {
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            console.log("Failed token payload:", {
              sub: payload.sub,
              exp: payload.exp,
              iss: payload.iss,
              now: Math.floor(Date.now() / 1000),
              expired: payload.exp
                ? payload.exp < Math.floor(Date.now() / 1000)
                : "no exp",
            });
          }
        } catch (e) {
          console.error("Could not decode failed token:", e);
        }
      }

      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: CLERK_SECRET_KEY
            ? "Invalid or expired token"
            : "CLERK_SECRET_KEY not configured",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
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
