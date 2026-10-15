import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { sentinelApiPlugin } from "./api-plugin.js";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

const token = randomBytes(32).toString("hex");
const allowedOrigins = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);
let api: Middleware | undefined;

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.headers.authorization !== `Bearer ${token}` || !api) {
    res.writeHead(401).end();
    return;
  }
  api(req, res, () => res.writeHead(404).end());
});

// ponytail: the Vite plugin only touches these two server hooks, so it runs unchanged here.
(sentinelApiPlugin().configureServer as (server: unknown) => void)({
  middlewares: { use: (fn: Middleware) => (api = fn) },
  httpServer: server,
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as AddressInfo;
  console.log(`SENTINEL_READY ${JSON.stringify({ port, token })}`);
});
