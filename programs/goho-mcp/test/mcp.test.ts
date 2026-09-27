import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Layer, Path, Queue, Ref, Schema, Stream } from "effect";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { ChildProcess } from "effect/unstable/process";
import { expect } from "vitest";

const receipt = {
  id: "42",
  storeName: "North Star Market",
  receiptDate: "2026-09-10",
  category: "Groceries",
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  items: [{ position: 0, name: "Apples", amount: "4.5" }],
};

const createPayload = {
  storeName: "North Star Market",
  receiptDate: "2026-09-10",
  category: "Groceries",
  subtotal: "21.5",
  tax: "1.72",
  total: "23.22",
  currency: "USD",
  items: [{ name: "Apples", amount: "4.5" }],
};

const RpcResponse = Schema.fromJsonString(
  Schema.Struct({ id: Schema.Finite, result: Schema.Unknown }),
);

const ToolList = Schema.Struct({
  tools: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      annotations: Schema.Struct({ readOnlyHint: Schema.Boolean }),
    }),
  ),
});

const ListResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ receipts: Schema.Array(Schema.Unknown) }),
});

const GetResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ receipt: Schema.Unknown }),
});

const ErrorResult = Schema.Struct({
  isError: Schema.Boolean,
  content: Schema.Array(Schema.Struct({ text: Schema.String })),
});

const startMcpClient = (baseUrl: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../src/main.ts", import.meta.url));

    const input = yield* Queue.unbounded<string>();
    const output = yield* Queue.unbounded<string>();

    const child = yield* ChildProcess.make(process.execPath, [mainPath], {
      env: { GOHO_SERVER_URL: baseUrl },
      extendEnv: true,
      stdin: {
        stream: Stream.fromQueue(input).pipe(Stream.encodeText),
        endOnDone: false,
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    yield* child.stdout.pipe(
      Stream.decodeText,
      Stream.splitLines,
      Stream.runForEach((line) => Queue.offer(output, line)),
      Effect.forkScoped,
    );

    const send = (method: string, params: unknown, id?: number) =>
      Queue.offer(input, `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);

    const request = (id: number, method: string, params: unknown) =>
      Effect.gen(function* () {
        yield* send(method, params, id);
        const response = yield* Schema.decodeEffect(RpcResponse)(yield* Queue.take(output));
        expect(response.id).toBe(id);
        return response.result;
      });

    const initialized = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ protocolVersion: Schema.String }),
    )(
      yield* request(1, "initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "goho-mcp-test", version: "1.0.0" },
      }),
    );
    expect(initialized.protocolVersion).toBe("2025-11-25");
    yield* send("notifications/initialized", undefined);

    return {
      request,
      list: (id: number) => request(id, "tools/call", { name: "list_receipts", arguments: {} }),
      create: (id: number, payload: unknown) =>
        request(id, "tools/call", { name: "create_receipt", arguments: payload }),
      get: (id: number, receiptId: string) =>
        request(id, "tools/call", {
          name: "get_receipt",
          arguments: { receipt_id: receiptId },
        }),
    };
  });

it.effect("lists populated and empty Goho receipts through MCP", () =>
  Effect.gen(function* () {
    const receipts = yield* Ref.make([receipt]);

    const ServerLive = HttpServer.serve(
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("/receipts");
        return HttpServerResponse.jsonUnsafe({ data: yield* Ref.get(receipts) });
      }),
    ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

    yield* Effect.gen(function* () {
      const server = yield* HttpServer.HttpServer;
      const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

      const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
        yield* client.request(2, "tools/list", {}),
      );
      expect(discovered.tools.map((tool) => tool.name)).toEqual([
        "hello",
        "list_receipts",
        "get_receipt",
        "create_receipt",
      ]);
      expect(discovered.tools[1]?.annotations.readOnlyHint).toBe(true);

      const listed = yield* Schema.decodeUnknownEffect(ListResult)(yield* client.list(3));
      expect(listed.isError).toBe(false);
      expect(listed.structuredContent).toEqual({ receipts: [receipt] });

      yield* Ref.set(receipts, []);
      const empty = yield* Schema.decodeUnknownEffect(ListResult)(yield* client.list(4));
      expect(empty.structuredContent).toEqual({ receipts: [] });
    }).pipe(Effect.provide(ServerLive));
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("returns an MCP tool error when Goho server is unavailable", () =>
  Effect.gen(function* () {
    const baseUrl = yield* HttpServer.HttpServer.pipe(
      Effect.map((server) => HttpServer.formatAddress(server.address)),
      Effect.provide(NodeHttpServer.layerTest),
    );
    const client = yield* startMcpClient(baseUrl);

    const unavailable = yield* Schema.decodeUnknownEffect(ErrorResult)(yield* client.list(2));
    expect(unavailable.isError).toBe(true);
    expect(unavailable.content[0]?.text).toMatch(/Could not list receipts/);
  }).pipe(Effect.provide(NodeServices.layer)),
);

const GetReceiptServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("GET");

    if (request.url === "/receipts/42") {
      return HttpServerResponse.jsonUnsafe({ data: receipt });
    }
    if (request.url === "/receipts/999") {
      return HttpServerResponse.jsonUnsafe({ _tag: "NotFound" }, { status: 404 });
    }
    return HttpServerResponse.empty({ status: 500 });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("gets a saved receipt by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const found = yield* Schema.decodeUnknownEffect(GetResult)(yield* client.get(2, "42"));
    expect(found.isError).toBe(false);
    expect(found.structuredContent).toEqual({ receipt });
  }).pipe(Effect.provide([GetReceiptServerLive, NodeServices.layer])),
);

it.effect("reports a missing receipt by ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const missing = yield* Schema.decodeUnknownEffect(ErrorResult)(yield* client.get(2, "999"));
    expect(missing.isError).toBe(true);
    expect(missing.content[0]?.text).toContain("Receipt 999 was not found.");
  }).pipe(Effect.provide([GetReceiptServerLive, NodeServices.layer])),
);

it.effect("rejects an invalid receipt ID through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(yield* client.get(2, "0"));
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'get_receipt'");
    expect(invalid.content[0]?.text).toContain("receipt_id");
  }).pipe(Effect.provide([GetReceiptServerLive, NodeServices.layer])),
);

const CreateReceiptServerLive = HttpServer.serve(
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/receipts");
    expect(request.headers["idempotency-key"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(yield* request.json).toEqual(createPayload);
    return HttpServerResponse.jsonUnsafe({ data: receipt });
  }),
).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

it.effect("creates a receipt with a generated idempotency key through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const created = yield* Schema.decodeUnknownEffect(GetResult)(
      yield* client.create(2, createPayload),
    );
    expect(created.isError).toBe(false);
    expect(created.structuredContent).toEqual({ receipt });
  }).pipe(Effect.provide([CreateReceiptServerLive, NodeServices.layer])),
);

it.effect("rejects invalid receipt details through MCP", () =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const client = yield* startMcpClient(HttpServer.formatAddress(server.address));

    const invalid = yield* Schema.decodeUnknownEffect(ErrorResult)(
      yield* client.create(2, { ...createPayload, items: [] }),
    );
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0]?.text).toContain("Invalid parameters for tool 'create_receipt'");
    expect(invalid.content[0]?.text).toContain("items");
  }).pipe(Effect.provide([CreateReceiptServerLive, NodeServices.layer])),
);
