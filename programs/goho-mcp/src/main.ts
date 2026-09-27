import { NodeCrypto, NodeRuntime, NodeStdio } from "@effect/platform-node";
import {
  CreateReceiptRequest,
  IdempotencyKey,
  Receipt,
  ReceiptId,
} from "@goho/goho-server-client/receipts";
import { Crypto, Effect, Layer, Schema } from "effect";
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

const GetReceipt = Tool.make("get_receipt", {
  description: "Get one saved Goho receipt, including its items, by receipt ID.",
  parameters: Schema.Struct({ receipt_id: ReceiptId }),
  success: Schema.Struct({ receipt: Receipt }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service],
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false);

const CreateReceipt = Tool.make("create_receipt", {
  description:
    "Create a saved Goho receipt from supplied details. Use fictional receipt details only when the user asks for an example. Goho MCP generates the idempotency key for this call.",
  parameters: CreateReceiptRequest,
  success: Schema.Struct({ receipt: Receipt }),
  failure: Schema.String,
  failureMode: "return",
  dependencies: [GohoServerClient.Service, Crypto.Crypto],
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

const GohoToolkit = Toolkit.make(Hello, ListReceipts, GetReceipt, CreateReceipt);

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
  get_receipt: ({ receipt_id }) =>
    Effect.gen(function* () {
      const client = yield* GohoServerClient.Service;
      const response = yield* client.receipts.get({ params: { receiptId: receipt_id } });
      return { receipt: response.data };
    }).pipe(
      Effect.mapError((cause) =>
        cause._tag === "NotFound"
          ? `Receipt ${receipt_id} was not found.`
          : "Could not get receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    ),
  create_receipt: (payload) =>
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto;
      const client = yield* GohoServerClient.Service;
      const idempotencyKey = IdempotencyKey.make(yield* crypto.randomUUIDv4);
      const response = yield* client.receipts.create({
        headers: { "idempotency-key": idempotencyKey },
        payload,
      });
      return { receipt: response.data };
    }).pipe(
      Effect.mapError(
        () =>
          "Could not create receipt. Start Goho server with pnpm server:dev and check GOHO_SERVER_URL.",
      ),
    ),
}).pipe(Layer.provide([GohoServerClient.layer, NodeCrypto.layer]));

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
