import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { registerListChannelsTool } from "./tools/list-channels.js";
import { registerDraftPostTool } from "./tools/draft-post.js";
import { registerPublishPostTool } from "./tools/publish-post.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "buffer-mcp-server",
    version: "1.0.0",
  });

  registerListChannelsTool(server);
  registerDraftPostTool(server);
  registerPublishPostTool(server);

  return server;
}

async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  // Simple bearer-token check so this endpoint isn't wide open on the public internet.
  // Set MCP_SHARED_SECRET and pass the same value as a custom header when registering
  // this connector in Claude, if your host supports custom headers. Otherwise, restrict
  // access at the network/hosting level instead.
  app.use((req, res, next) => {
    const secret = process.env.MCP_SHARED_SECRET;
    if (!secret) return next(); // no secret configured, skip check
    const provided = req.headers["x-mcp-secret"];
    if (provided !== secret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  app.post("/mcp", async (req, res) => {
    // Stateless: a fresh transport per request avoids request-ID collisions across clients.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());

    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`buffer-mcp-server listening on http://localhost:${port}/mcp`);
  });
}

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
