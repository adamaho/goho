import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Layer, Schema } from "effect";
import { McpProtocol, McpServer } from "effect/ai";
import { HttpRouter, HttpServerResponse } from "effect/http";

import * as GohoTools from "./tools/index.ts";

const McpLive = Layer.effectDiscard(McpServer.registerToolkit(GohoTools.toolkit)).pipe(
  Layer.provide(GohoTools.layer),
  Layer.provide(
    McpServer.layerHttp({
      name: "goho-mcp",
      version: "0.0.0",
      path: "/mcp",
      protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18],
    }),
  ),
);

// Liveness only: it does not check that the Goho API is reachable.
const HealthLive = HttpRouter.add(
  "GET",
  "/health",
  HttpServerResponse.jsonUnsafe({ data: { status: "ok" } }),
);

const ServerLive = HttpRouter.serve(Layer.mergeAll(McpLive, HealthLive)).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.String("GOHO_MCP_HOST").pipe(Config.withDefault("127.0.0.1")),
      // Port 0 picks a free port; the chosen address is logged on startup.
      port: Config.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 65535 })),
        "GOHO_MCP_PORT",
      ).pipe(Config.withDefault(3001)),
    }),
  ),
);

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
