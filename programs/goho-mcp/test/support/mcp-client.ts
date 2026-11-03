import { Deferred, Effect, identity, Path, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
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
 * Response shape for a successful receipt deletion.
 *
 * @category testing
 * @since 0.1.0
 */
export const DeleteResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ deleted_receipt_id: Schema.String }),
});

/**
 * Response shape for a successful book list.
 *
 * @category testing
 * @since 0.1.0
 */
export const BookListResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ books: Schema.Array(Schema.Unknown) }),
});

/**
 * Response shape for a successful book lookup, creation, or correction.
 *
 * @category testing
 * @since 0.1.0
 */
export const BookResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ book: Schema.Unknown }),
});

/**
 * Response shape for a successful book deletion.
 *
 * @category testing
 * @since 0.1.0
 */
export const DeleteBookResult = Schema.Struct({
  isError: Schema.Boolean,
  structuredContent: Schema.Struct({ deleted_book_id: Schema.String }),
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
 * The MCP program exited before it started listening.
 *
 * @category testing
 * @since 0.1.0
 */
export class McpProgramExited extends Schema.TaggedError<McpProgramExited>()("McpProgramExited", {
  exitCode: Schema.Finite,
}) {}

/**
 * Starts the MCP program on a loopback port for integration tests, free unless one is given.
 *
 * @category testing
 * @since 0.1.0
 */
export const startMcpServer = (baseUrl: string, port = "0") =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../../src/main.ts", import.meta.url));

    const child = yield* ChildProcess.make(process.execPath, [mainPath], {
      env: { GOHO_SERVER_URL: baseUrl, GOHO_MCP_HOST: "127.0.0.1", GOHO_MCP_PORT: port },
      extendEnv: true,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
      // Bounds cleanup when a stalled request holds up graceful shutdown.
      forceKillAfter: "5 seconds",
    });

    // Keep draining logs so the child never blocks on a full stdout pipe.
    const listening = yield* Deferred.make<string>();
    yield* child.stdout.pipe(
      Stream.decodeText,
      Stream.splitLines,
      Stream.runForEach((line) => {
        const url = /Listening on (\S+)/.exec(line)?.[1];
        return url === undefined ? Effect.void : Deferred.succeed(listening, url);
      }),
      Effect.forkScoped,
    );

    const url = yield* Deferred.await(listening).pipe(
      Effect.raceFirst(
        Effect.flatMap(child.exitCode, (exitCode) =>
          Effect.fail(new McpProgramExited({ exitCode })),
        ),
      ),
    );

    return { child, url };
  });

/**
 * Initializes a Streamable HTTP MCP session against a running MCP program.
 *
 * @category testing
 * @since 0.1.0
 */
export const connectMcpClient = (url: string, protocolVersion = "2025-11-25") =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    let sessionId: string | undefined;
    let negotiatedVersion: string | undefined;

    const post = (message: unknown) =>
      HttpClientRequest.post(`${url}/mcp`).pipe(
        HttpClientRequest.accept("application/json, text/event-stream"),
        sessionId === undefined
          ? identity
          : HttpClientRequest.setHeader("mcp-session-id", sessionId),
        negotiatedVersion === undefined
          ? identity
          : HttpClientRequest.setHeader("mcp-protocol-version", negotiatedVersion),
        HttpClientRequest.bodyJsonUnsafe(message),
        http.execute,
      );

    const send = (method: string, params: unknown) =>
      Effect.gen(function* () {
        const response = yield* post({ jsonrpc: "2.0", method, params });
        expect(response.status).toBe(202);
      });

    const request = (id: number, method: string, params: unknown) =>
      Effect.gen(function* () {
        const response = yield* post({ jsonrpc: "2.0", id, method, params });
        expect(response.status).toBe(200);
        sessionId ??= response.headers["mcp-session-id"];
        // Responses are plain JSON or server-sent events carrying JSON messages.
        const text = yield* response.text;
        const messages = response.headers["content-type"]?.startsWith("text/event-stream")
          ? text.split("\n").flatMap((line) => (line.startsWith("data: ") ? [line.slice(6)] : []))
          : [text];
        const decoded = yield* Schema.decodeEffect(RpcResponse)(messages.at(-1) ?? "");
        expect(decoded.id).toBe(id);
        return decoded.result;
      });

    const initialized = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ protocolVersion: Schema.String }),
    )(
      yield* request(1, "initialize", {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "goho-mcp-test", version: "1.0.0" },
      }),
    );
    expect(initialized.protocolVersion).toBe(protocolVersion);
    negotiatedVersion = protocolVersion;
    yield* send("notifications/initialized", undefined);

    return {
      request,
      call: (id: number, name: string, args: unknown) =>
        request(id, "tools/call", { name, arguments: args }),
    };
  }).pipe(Effect.provide(FetchHttpClient.layer));
