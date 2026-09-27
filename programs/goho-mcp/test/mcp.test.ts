import { NodeHttpServer, NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Context, Effect, Exit, Layer, Path, Queue, Ref, Schema, Scope, Stream } from "effect";
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

const ErrorResult = Schema.Struct({
  isError: Schema.Boolean,
  content: Schema.Array(Schema.Struct({ text: Schema.String })),
});

it.effect("lists Goho receipts through MCP and reports server failures", () =>
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

    const serverScope = yield* Scope.make();
    yield* Effect.addFinalizer((exit) => Scope.close(serverScope, exit));
    const serverContext = yield* Layer.buildWithScope(ServerLive, serverScope);
    const server = Context.get(serverContext, HttpServer.HttpServer);

    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../src/main.ts", import.meta.url));

    const input = yield* Queue.unbounded<string>();
    const output = yield* Queue.unbounded<string>();

    const child = yield* ChildProcess.make(process.execPath, [mainPath], {
      env: { GOHO_SERVER_URL: HttpServer.formatAddress(server.address) },
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

    const list = (id: number) =>
      request(id, "tools/call", { name: "list_receipts", arguments: {} });

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

    const discovered = yield* Schema.decodeUnknownEffect(ToolList)(
      yield* request(2, "tools/list", {}),
    );
    expect(discovered.tools.map((tool) => tool.name)).toEqual(["hello", "list_receipts"]);
    expect(discovered.tools[1]?.annotations.readOnlyHint).toBe(true);

    const listed = yield* Schema.decodeUnknownEffect(ListResult)(yield* list(3));
    expect(listed.isError).toBe(false);
    expect(listed.structuredContent).toEqual({ receipts: [receipt] });

    yield* Ref.set(receipts, []);
    const empty = yield* Schema.decodeUnknownEffect(ListResult)(yield* list(4));
    expect(empty.structuredContent).toEqual({ receipts: [] });

    yield* Scope.close(serverScope, Exit.succeed(undefined));
    const unavailable = yield* Schema.decodeUnknownEffect(ErrorResult)(yield* list(5));
    expect(unavailable.isError).toBe(true);
    expect(unavailable.content[0]?.text).toMatch(/Could not list receipts/);
  }).pipe(Effect.provide(NodeServices.layer)),
);
