import { getStore } from "@netlify/blobs";
export default async (request) => {
  const store = getStore("analytics-store");
  if (request.method === "POST") {
    const { linkId } = await request.json();
    let count = (await store.get(linkId)) || 0;
    await store.set(linkId, count + 1);
    return new Response("OK");
  } else if (request.method === "GET") {
    const allData = await store.list();
    return Response.json(allData);
  }
};
