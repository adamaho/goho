import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { expect } from "vitest";

import { connectMcpClient, ErrorResult, startMcpServer } from "./support/mcp-client.ts";
import * as McpFixture from "./support/mcp-fixture.ts";

// Each test here owns its program, because it ends that program or needs a different environment.
const unreachableApi = "http://127.0.0.1:1";

it.live(
  "stops listening when the process is terminated",
  () =>
    Effect.gen(function* () {
      const { child, url } = yield* startMcpServer(unreachableApi);
      yield* child.kill();
      expect(yield* child.isRunning).toBe(false);
      // 130 is the program's own interrupted exit, not a forced stop.
      expect(yield* child.exitCode).toBe(130);
      const refused = yield* HttpClient.get(`${url}/health`).pipe(Effect.flip);
      expect(refused._tag).toBe("HttpClientError");
    }).pipe(Effect.provide([NodeServices.layer, FetchHttpClient.layer])),
  McpFixture.coldStartTimeout,
);

it.live(
  "reports an API that refuses connections",
  () =>
    Effect.gen(function* () {
      const { url } = yield* startMcpServer(unreachableApi);
      const client = yield* connectMcpClient(url);
      const refused = yield* Schema.decodeUnknownEffect(ErrorResult)(
        yield* client.call(2, "list_receipts", {}),
      );
      expect(refused.isError).toBe(true);
      expect(refused.content[0]?.text).toMatch(/Could not list receipts/);
    }).pipe(Effect.provide(NodeServices.layer)),
  McpFixture.coldStartTimeout,
);

it.live(
  "fails right away when the program exits before listening",
  () =>
    Effect.gen(function* () {
      const exited = yield* startMcpServer(unreachableApi, "70000").pipe(Effect.flip);
      expect(exited).toMatchObject({ _tag: "McpProgramExited", exitCode: 1 });
    }).pipe(Effect.provide(NodeServices.layer)),
  McpFixture.coldStartTimeout,
);
