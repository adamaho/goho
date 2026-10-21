import { NodeFileSystem, NodePath, NodeRuntime } from "@effect/platform-node";
import { api } from "@goho/goho-api/api";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { OpenApi } from "effect/http-api";
import { format } from "oxfmt";

class OpenApiCommandError extends Schema.TaggedError<OpenApiCommandError>()(
  "GohoServer.OpenApiCommandError",
  { message: Schema.String },
) {}

const exportOpenApi = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const outputFile = yield* path.fromFileUrl(
    new URL("../../../packages/goho-api/openapi.json", import.meta.url),
  );
  const spec = OpenApi.fromApi(api);
  const unnamed = Object.keys(spec.components.schemas).filter((name) => name.endsWith("Encoded"));
  if (unnamed.length > 0) {
    return yield* new OpenApiCommandError({
      message: `Name the encoded side of these schemas: ${unnamed.join(", ")}`,
    });
  }
  const generated = `${JSON.stringify(spec, null, 2)}\n`;
  const { code: document, errors } = yield* Effect.tryPromise(() =>
    format("openapi.json", generated),
  ).pipe(
    Effect.mapError(
      (cause) => new OpenApiCommandError({ message: `Could not format OpenAPI: ${String(cause)}` }),
    ),
  );
  if (errors.length > 0) {
    return yield* new OpenApiCommandError({
      message: `Could not format OpenAPI: ${JSON.stringify(errors)}`,
    });
  }

  if (process.argv[2] === "--check") {
    const current = yield* fileSystem.readFileString(outputFile);
    if (current !== document) {
      return yield* new OpenApiCommandError({
        message: "OpenAPI document is stale. Run pnpm --filter @goho/goho-server openapi:generate.",
      });
    }
  } else {
    yield* fileSystem.writeFileString(outputFile, document);
  }
});

exportOpenApi.pipe(
  Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)),
  NodeRuntime.runMain,
);
