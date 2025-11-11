import { getStore } from "@netlify/blobs";

const API_KEY = Netlify.env.get("MY_API_KEY") || "";

export default async (request) => {
  // Check API key
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== API_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const store = getStore("analytics-store");

  if (request.method === "POST") {
    const { linkId } = await request.json();
    if (!linkId) {
      return new Response("linkId is required", { status: 400 });
    }
    let count = (await store.get(linkId)) || 0;
    await store.set(linkId, count + 1);
    return new Response("OK");
  } else if (request.method === "GET") {
    const allData = await store.list();
    return Response.json(allData);
  }
};
