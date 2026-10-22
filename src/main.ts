import "./load-env.js";
import { loadConfig } from "./config.js";
import { createContainer } from "./container.js";
import { buildServer } from "./http/server.js";

const cfg = loadConfig();
const container = createContainer(cfg);
const app = await buildServer(container.deps, {
  jwtSecret: cfg.JWT_SECRET,
  localStorage: container.localStorage,
  logger: {
    level: cfg.LOG_LEVEL,
    redact: ["req.headers.authorization", "req.headers[\"client-token\"]"],
    // O token do webhook está no path — não logar a URL completa.
    serializers: { req: (r: { method: string; routeOptions?: { url?: string } }) => ({ method: r.method, route: r.routeOptions?.url }) },
  },
});

await app.listen({ port: cfg.PORT, host: "0.0.0.0" });

async function shutdown() {
  await app.close();
  await container.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
