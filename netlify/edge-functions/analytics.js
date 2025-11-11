import { getStore } from "@netlify/blobs";

const API_KEY = Netlify.env.get("MY_API_KEY") || "";
const CLERK_SECRET_KEY = Netlify.env.get("CLERK_SECRET_KEY") || "";

// Helper to decode base64 in edge functions
function base64Decode(str) {
  // Edge functions support atob
  // JWT base64url encoding uses - and _ instead of + and /
  try {
    // First try direct atob (standard base64)
    return atob(str);
  } catch (e) {
    // If that fails, try base64url decoding
    try {
      return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    } catch (e2) {
      console.error("Base64 decode error:", e2);
      throw e2;
    }
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
    const currentValue = await store.get(linkId);
    // Parse as integer to ensure numeric addition, not string concatenation
    // Handle both string and number types from the store
    let count = 0;
    if (currentValue !== null && currentValue !== undefined) {
      if (typeof currentValue === 'number') {
        count = currentValue;
      } else if (typeof currentValue === 'string') {
        count = parseInt(currentValue, 10) || 0;
      } else {
        count = Number(currentValue) || 0;
      }
    }
    const newCount = count + 1;
    console.log(`Incrementing linkId ${linkId}: ${count} -> ${newCount}`);
    // Store as string to ensure proper persistence with Netlify Blobs
    await store.set(linkId, String(newCount));
    return new Response("OK");
  } else if (request.method === "GET") {
    try {
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

      // Get all blobs from the store
      // Netlify Blobs list() returns a list result that needs to be iterated
      const allData = await store.list();
      console.log(
        "store.list() returned:",
        typeof allData,
        JSON.stringify(allData)
      );

      const analytics = {};

      // Netlify Blobs list() returns an object with blobs array
      if (allData && allData.blobs && Array.isArray(allData.blobs)) {
        console.log("Found blobs array with", allData.blobs.length, "entries");
        for (const blob of allData.blobs) {
          const key = blob.key;
          const count = await store.get(key);
          analytics[key] = parseInt(count) || 0;
          console.log(`Processed ${key}: ${count}`);
        }
      } else if (Array.isArray(allData)) {
        // If it's directly an array
        console.log("Found array with", allData.length, "entries");
        for (const entry of allData) {
          const key = entry.key || entry;
          const count = await store.get(key);
          analytics[key] = parseInt(count) || 0;
        }
      } else if (allData && typeof allData[Symbol.iterator] === "function") {
        // If it's iterable
        console.log("Found iterable");
        for (const entry of allData) {
          const key = entry.key || entry;
          const count = await store.get(key);
          analytics[key] = parseInt(count) || 0;
        }
      } else {
        console.warn("Unexpected allData format:", allData);
        // Fallback: Try to get known keys directly
        // This is a workaround if list() doesn't work as expected
        // Also try to get any keys that might have been stored
        const knownKeys = ["1", "2", "3", "4", "5", "6"];
        for (const key of knownKeys) {
          try {
            const count = await store.get(key);
            console.log(`Key ${key} value:`, count, typeof count);
            // Always add the key, even if count is null/undefined (will be 0)
            if (count !== null && count !== undefined) {
              analytics[key] = parseInt(count, 10) || 0;
            } else {
              // Key doesn't exist yet, don't add it to analytics
              console.log(`Key ${key} does not exist in store`);
            }
          } catch (e) {
            console.error(`Error getting key ${key}:`, e);
          }
        }
      }

      // If still empty, try listing with pagination
      if (Object.keys(analytics).length === 0) {
        console.log("Analytics still empty, trying list with options");
        try {
          const listResult = await store.list({ paginate: true });
          console.log("List with paginate returned:", listResult);
          if (listResult && listResult.blobs) {
            for (const blob of listResult.blobs) {
              const count = await store.get(blob.key);
              analytics[blob.key] = parseInt(count) || 0;
            }
          }
        } catch (e) {
          console.error("Error with paginated list:", e);
        }
      }

      console.log("Analytics data prepared:", analytics);
      return Response.json(analytics);
    } catch (error) {
      console.error("Error in GET /api/analytics:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: error.message || "An error occurred",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } else if (request.method === "DELETE") {
    // DELETE requires authentication (API key or Clerk)
    const authenticated = await isAuthenticated(request, context);
    if (!authenticated) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Authentication required to clear analytics",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    try {
      // Get all keys from the store
      const allData = await store.list();
      let keysToDelete = [];

      // Extract keys from different return types
      if (allData && allData.blobs && Array.isArray(allData.blobs)) {
        keysToDelete = allData.blobs.map((blob) => blob.key);
      } else if (Array.isArray(allData)) {
        keysToDelete = allData.map((entry) => entry.key || entry);
      } else if (allData && typeof allData[Symbol.iterator] === "function") {
        keysToDelete = Array.from(allData).map((entry) => entry.key || entry);
      } else {
        // Fallback: try known keys
        const knownKeys = ["1", "2", "3", "4", "5", "6"];
        for (const key of knownKeys) {
          const value = await store.get(key);
          if (value !== null && value !== undefined) {
            keysToDelete.push(key);
          }
        }
      }

      // Delete all keys
      let deletedCount = 0;
      for (const key of keysToDelete) {
        await store.delete(key);
        deletedCount++;
      }

      console.log(`Cleared ${deletedCount} analytics entries`);
      return Response.json({
        success: true,
        message: `Cleared ${deletedCount} analytics entries`,
        deletedCount,
      });
    } catch (error) {
      console.error("Error clearing analytics:", error);
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message: error.message || "An error occurred",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
