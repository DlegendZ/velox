import http from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";

/**
 * Same-origin relay to the public PeerJS broker, for players whose network cannot reach
 * 0.peerjs.com directly. Only the short connection handshake passes through here; race
 * data still flows browser to browser.
 */
const UPSTREAM = "0.peerjs.com";

/** The broker path after /api/peerjs (vercel.json forwards it as ?__p= on rewrites). */
function target(url = "") {
  const u = new URL(url, "http://relay.local");
  const forwarded = u.searchParams.get("__p");
  u.searchParams.delete("__p");
  const path =
    forwarded !== null
      ? "/" + forwarded.replace(/^\/+/, "")
      : u.pathname.replace(/^\/api\/peerjs/, "") || "/";
  const query = u.searchParams.toString();
  return { path, query: query ? "?" + query : "" };
}

const server = http.createServer(async (req, res) => {
  const { path, query } = target(req.url);
  if (req.method !== "GET" || !/^\/peerjs\/(id|peers)$/.test(path)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const upstream = await fetch(`https://${UPSTREAM}${path}${query}`, {
      signal: AbortSignal.timeout(8000),
    });
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "text/plain",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    res.end(await upstream.text());
  } catch {
    res.writeHead(502).end();
  }
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on("connection", (client, req) => {
  const { path, query } = target(req.url);
  if (path !== "/peerjs") {
    client.close(1008, "Unknown path");
    return;
  }
  const upstream = new WebSocket(`wss://${UPSTREAM}/peerjs${query}`);
  // Offers can arrive before the upstream socket opens.
  const queue: [RawData, boolean][] = [];
  upstream.on("open", () => {
    for (const [data, binary] of queue.splice(0))
      upstream.send(data, { binary });
  });
  upstream.on("message", (data, binary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary });
  });
  client.on("message", (data, binary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
    else if (queue.length < 64) queue.push([data, binary]);
  });
  const end = () => {
    if (client.readyState <= WebSocket.OPEN) client.terminate();
    if (upstream.readyState <= WebSocket.OPEN) upstream.terminate();
  };
  upstream.on("close", end);
  upstream.on("error", end);
  client.on("close", end);
  client.on("error", end);
});

export default server;
