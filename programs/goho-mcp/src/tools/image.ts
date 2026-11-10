import { Context, Effect, Schema } from "effect";
import { McpSchema, McpServer, Tool } from "effect/ai";

import { apiFailure, ToolFailure } from "./failure.ts";

// The Goho API stores and serves saved images only as these types, exactly as written. An empty
// body is no image, so it must not become one.
const SavedImage = Schema.Struct({
  body: Schema.Uint8Array.check(Schema.isMinLength(1)),
  headers: Schema.Struct({
    "content-type": Schema.Literals(["image/jpeg", "image/png", "image/webp"]),
  }),
});

/**
 * A saved image as the Goho API returns it.
 *
 * @category models
 * @since 0.1.0
 */
export interface ImageResponse {
  readonly body: Uint8Array;
  readonly headers: { readonly "content-type": string };
}

/**
 * Registers a read-only tool that returns one saved Goho image as native MCP image content.
 *
 * **Details**
 *
 * `registerToolkit` sends every success as JSON text, so these tools register through
 * `McpServer.addTool` with their own `CallToolResult`. Arguments that do not match `parameters`
 * are rejected before `get` runs, like toolkit tools. An empty response, or one whose content type
 * is not a stored image type, fails as incompatible instead of becoming an image.
 *
 * @category tools
 * @since 0.1.0
 */
export const register = Effect.fn("@goho/ImageTool.register")(function* <Params>(options: {
  readonly name: string;
  readonly description: string;
  readonly action: string;
  readonly parameters: Schema.Codec<Params, unknown>;
  readonly get: (params: Params) => Effect.Effect<ImageResponse, ToolFailure>;
}) {
  const { name, description, action, parameters, get } = options;
  const server = yield* McpServer.McpServer;
  const inputSchema = yield* Schema.decodeUnknownEffect(McpSchema.ToolJson)(
    Tool.getJsonSchemaFromSchema(parameters),
  ).pipe(Effect.orDie);
  const decodeParams = Schema.decodeUnknownEffect(parameters);
  const decodeImage = Schema.decodeUnknownEffect(SavedImage);

  yield* server.addTool({
    tool: new McpSchema.Tool({
      name,
      description,
      inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    }),
    annotations: Context.empty(),
    handle: (payload) =>
      decodeParams(payload ?? {}, { errors: "all" }).pipe(
        Effect.mapError(
          (cause) =>
            new McpSchema.InvalidParams({
              message: `Invalid parameters for tool '${name}': ${cause.message}`,
            }),
        ),
        Effect.flatMap((params) =>
          get(params).pipe(
            Effect.flatMap((response) =>
              decodeImage(response).pipe(
                Effect.mapError((cause) => apiFailure(action, cause)),
                Effect.map(
                  ({ body, headers }) =>
                    new McpSchema.CallToolResult({
                      isError: false,
                      content: [{ type: "image", data: body, mimeType: headers["content-type"] }],
                    }),
                ),
              ),
            ),
            Effect.catchTag("ToolFailure", (failure) =>
              Effect.succeed(
                new McpSchema.CallToolResult({
                  isError: true,
                  content: [{ type: "text", text: failure.message }],
                }),
              ),
            ),
          ),
        ),
      ),
  });
});
