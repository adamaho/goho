import { NodeRuntime, NodeStdio } from "@effect/platform-node";
import { Layer } from "effect";
import { McpProtocol, McpServer } from "effect/unstable/ai";

import * as Tools from "./tools/index.ts";

const ServerLive = Layer.effectDiscard(McpServer.registerToolkit(Tools.toolkit)).pipe(
  Layer.provide(Tools.layer),
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
