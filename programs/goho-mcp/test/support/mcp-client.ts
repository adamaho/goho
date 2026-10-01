import { Effect, Path, Queue, Schema, Stream } from "effect";
import { ChildProcess } from "effect/process";
import { expect } from "vitest";

const RpcResponse = Schema.fromJsonString(
  Schema.Struct({ id: Schema.Finite, result: Schema.Unknown }),
);

/**
 * Response shape for a successful receipt list.
 *
 * @category testing
 * @since 0.1.0
 */
export const ListResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ receipts: Schema.Array(Schema.Unknown) }),
});

/**
 * Response shape for a successful receipt lookup or creation.
 *
 * @category testing
 * @since 0.1.0
 */
export const ReceiptResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ receipt: Schema.Unknown }),
});

/**
 * Response shape for an MCP tool failure.
 *
 * @category testing
 * @since 0.1.0
 */
export const ErrorResult = Schema.Struct({
  isError: Schema.Boolean,
  content: Schema.Array(Schema.Struct({ text: Schema.String })),
});

/**
 * Starts and initializes the MCP process for integration tests.
 *
 * @category testing
 * @since 0.1.0
 */
export const startMcpClient = (baseUrl: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../../src/main.ts", import.meta.url));

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
      call: (id: number, name: string, args: unknown) =>
        request(id, "tools/call", { name, arguments: args }),
    };
  });
