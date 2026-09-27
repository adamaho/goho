import { NodeRuntime, NodeStdio } from "@effect/platform-node";
import { Receipt } from "@goho/goho-server-client/receipts";
import { Effect, Layer, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/unstable/ai";

import * as GohoServerClient from "./goho-server-client.ts";

const Hello = Tool.make("hello", {
  description: "Return a greeting from Goho.",
  success: Schema.String,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const ListReceipts = Tool.make("list_receipts", {
  description: "List all saved Goho receipts, newest first, including their items.",
  success: Schema.Struct({ receipts: Schema.Array(Receipt) }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const GohoToolkit = Toolkit.make(Hello, ListReceipts);

const ToolsLive = GohoToolkit.toLayer({
  hello: () => Effect.succeed("Hello, world!"),
  list_receipts: () =>
    Effect.gen(function* () {
      const client = yield* GohoServerClient.Service;
      const response = yield* client.receipts.list();
      return { receipts: response.data };
    }).pipe(
      Effect.mapError(
        () =>
          "Could not list receipts. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    ),
}).pipe(Layer.provide(GohoServerClient.layer));

const ServerLive = Layer.effectDiscard(McpServer.registerToolkit(GohoToolkit)).pipe(
  Layer.provide(ToolsLive),
  Layer.provide(
    McpServer.layerStdio({
      name: "goho-mcp",
      version: "0.0.0",
      protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18],
    }),
  ),
  Layer.provide(NodeStdio.layer),
);

Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
