import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Ai } from "@goho/core";
import { Array as Arr, Config, Effect, Layer, Option, Predicate, Record, Schema } from "effect";
import { AiError } from "effect/ai";
import { FetchHttpClient } from "effect/http";

type CreateResponse = Parameters<OpenAiClient.Service["createResponse"]>[0];

const isReference = Schema.is(Schema.Struct({ $ref: Schema.String }));

// Effect's OpenAI converter renders a described reference, such as a recipe
// mark's `portion`, as `{ $ref, description }`, which OpenAI rejects: a `$ref`
// cannot have other keywords. Only that description is dropped; the referenced
// schema keeps every constraint, and the codec still validates the output.
const withoutReferenceDescriptions = (node: Schema.Json): Schema.Json => {
  if (Arr.isArray<Schema.Json>(node)) return node.map(withoutReferenceDescriptions);
  if (!Predicate.isObjectKeyword(node)) return node;
  const schema = isReference(node)
    ? Record.remove<string, Schema.Json, string>(node, "description")
    : node;
  return Record.map(schema, withoutReferenceDescriptions);
};

const JsonSchemaObject = Schema.Record(Schema.String, Schema.Json);

const unsupportedSchema = (description: string) =>
  AiError.make({
    module: "GohoServer.Ai",
    method: "normalizeRequest",
    reason: new AiError.UnsupportedSchemaError({ description }),
  });

const normalizeRequest = Effect.fnUntraced(function* (request: CreateResponse) {
  const format = request.text?.format;
  if (format?.type !== "json_schema") return request;
  const decoded = yield* Schema.decodeUnknownEffect(JsonSchemaObject)(format.schema).pipe(
    Effect.mapError((error) => unsupportedSchema(error.message)),
  );
  const schema = Record.map(decoded, withoutReferenceDescriptions);
  return { ...request, text: { ...request.text, format: { ...format, schema } } };
});

// The OpenAI fields of an error reason's provider metadata.
const OpenAiErrorMetadata = Schema.Struct({
  errorCode: Schema.NullOr(Schema.String),
  errorType: Schema.NullOr(Schema.String),
  requestId: Schema.NullOr(Schema.String),
});

const decodeOpenAiErrorMetadata = Schema.decodeUnknownOption(OpenAiErrorMetadata);

// Logs what identifies a failed OpenAI request without the request, response
// body or headers: the reason, retryability, HTTP status and OpenAI's error code,
// type and request ID. The provider's description is logged only for a rejected
// structured-output schema, where it names the schema keyword at fault;
// elsewhere it can quote the response body or model output.
const logFailure = (error: AiError.AiError) => {
  const { reason } = error;
  const openai = Option.getOrUndefined(
    decodeOpenAiErrorMetadata("metadata" in reason ? reason.metadata.openai : undefined),
  );
  const invalidSchema =
    reason._tag === "InvalidRequestError" && openai?.errorCode === "invalid_json_schema";
  return Effect.logWarning("OpenAI request failed", {
    module: error.module,
    method: error.method,
    reason: reason._tag,
    retryable: error.isRetryable,
    status: "http" in reason ? reason.http?.response?.status : undefined,
    errorCode: openai?.errorCode,
    errorType: openai?.errorType,
    requestId: openai?.requestId,
    description: invalidSchema ? reason.description : undefined,
  });
};

const OpenAiClientLive = Layer.effect(
  OpenAiClient.OpenAiClient,
  Effect.gen(function* () {
    const client = yield* OpenAiClient.OpenAiClient;
    return OpenAiClient.OpenAiClient.of({
      ...client,
      createResponse: Effect.fn("@goho/OpenAi.createResponse")(function* (request) {
        return yield* client.createResponse(yield* normalizeRequest(request));
      }, Effect.tapError(logFailure)),
    });
  }),
).pipe(
  Layer.provide(OpenAiClient.layerConfig({ apiKey: Config.Redacted("OPENAI_API_KEY") })),
  Layer.provide(FetchHttpClient.layer),
);

const OpenAiLanguageModelLive = Layer.unwrap(
  Config.String("OPENAI_MODEL").pipe(Effect.map(OpenAiLanguageModel.model)),
).pipe(Layer.provide(OpenAiClientLive));

/**
 * Provides AI generation backed by the configured OpenAI model.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Ai.layer.pipe(Layer.provide(OpenAiLanguageModelLive));
