import { NodeRuntime, NodeStdio } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/unstable/ai";

const Hello = Tool.make("hello", {
  description: "Return a greeting from Goho.",
  success: Schema.String,
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const HelloToolkit = Toolkit.make(Hello);

const HelloLive = HelloToolkit.toLayer({
  hello: () => Effect.succeed("Hello, world!"),
});

const ServerLive = Layer.effectDiscard(McpServer.registerToolkit(HelloToolkit)).pipe(
  Layer.provide(HelloLive),
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
