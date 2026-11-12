import { it } from "@effect/vitest";
import { Ai as CoreAi } from "@goho/core";
import { ConfigProvider, Effect, Layer, Logger, Result, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { expect } from "vitest";

import * as RecipeExtraction from "#src/recipes/extraction.ts";
import * as Ai from "#src/services/ai.ts";

const apiKey = "sk-test-key-never-logged";
const pageText = "Grandma's secret page text";

const invalidSchema = {
  error: {
    message:
      "Invalid schema for response_format 'recipe_extraction': context=('properties', 'portion'), $ref cannot have keywords {'description'}.",
    type: "invalid_request_error",
    param: "text.format.schema",
    code: "invalid_json_schema",
  },
};

// The request OpenAI receives, down to the structured-output definitions.
const SentRequest = Schema.fromJsonString(
  Schema.Struct({
    text: Schema.Struct({
      format: Schema.Struct({
        type: Schema.Literal("json_schema"),
        name: Schema.String,
        strict: Schema.Boolean,
        schema: Schema.Struct({
          $defs: Schema.Record(
            Schema.String,
            Schema.Struct({
              properties: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
              required: Schema.optional(Schema.Array(Schema.String)),
            }),
          ),
        }),
      }),
    }),
  }),
);

// A reference with no other keywords.
const decodeBareReference = (schema: unknown) =>
  Schema.decodeUnknownEffect(Schema.Struct({ $ref: Schema.String }))(schema, {
    onExcessProperty: "error",
  });

// Runs `effect` against the real OpenAI layer, answering every request with a
// rejected schema, and records the requests sent and the warnings logged.
const withRejectingOpenAi = <A, E>(effect: Effect.Effect<A, E, CoreAi.Service>) =>
  Effect.gen(function* () {
    const requests: Array<Request> = [];
    const warnings: Array<unknown> = [];
    const fetch: typeof globalThis.fetch = (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(
        Response.json(invalidSchema, { status: 400, headers: { "x-request-id": "req_test" } }),
      );
    };
    const openAi = Ai.layer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ OPENAI_API_KEY: apiKey, OPENAI_MODEL: "gpt-test" }),
        ),
      ),
    );
    const logger = Logger.layer([
      Logger.make(({ message, logLevel }) => {
        if (logLevel === "Warn") warnings.push(message);
      }),
    ]);
    const result = yield* effect.pipe(Effect.provide(Layer.merge(openAi, logger)), Effect.result);
    return { result, requests, warnings };
  });

it.effect("sends the recipe extraction schema without keywords beside a $ref", () =>
  Effect.gen(function* () {
    const { result, requests, warnings } = yield* withRejectingOpenAi(
      RecipeExtraction.extract({
        title: "Rocky Road Cookies",
        description: null,
        structuredRecipes: [],
        text: pageText,
        imageUrl: null,
      }),
    );

    const [request] = requests;
    expect(requests).toHaveLength(1);
    expect(request?.headers.get("authorization")).toBe(`Bearer ${apiKey}`);
    const body = yield* Effect.tryPromise(() => request?.text() ?? Promise.resolve(""));
    const { format } = (yield* Schema.decodeEffect(SentRequest)(body)).text;
    expect(format).toMatchObject({ name: "recipe_extraction", strict: true });

    // Every `$ref` in the request stands alone.
    expect(body.match(/"\$ref"/g)?.length).toBe(body.match(/\{"\$ref":"[^"]*"\}/g)?.length);

    // Each ingredient mark's portion still points at a positive fraction.
    const definitions = format.schema.$defs;
    const marks = Object.keys(definitions).filter((name) => name.startsWith("IngredientMark"));
    expect(marks).toHaveLength(4);
    for (const mark of marks) {
      const { $ref } = yield* decodeBareReference(definitions[mark]?.properties?.portion);
      const positive = { type: "integer", exclusiveMinimum: 0, maximum: Number.MAX_SAFE_INTEGER };
      expect(definitions[$ref.replace("#/$defs/", "")]).toMatchObject({
        properties: { numerator: positive, denominator: positive },
        required: ["numerator", "denominator"],
      });
    }

    // The provider's rejection stays a permanent processing failure.
    expect(Result.isFailure(result) && result.failure).toMatchObject({
      failureCode: "processing_failed",
      retryable: false,
      cause: { reason: { _tag: "InvalidRequestError" } },
    });

    // The warning names the schema fault, never the key or the page.
    expect(warnings).toEqual([
      [
        "OpenAI request failed",
        {
          module: "OpenAiClient",
          method: "createResponse",
          reason: "InvalidRequestError",
          retryable: false,
          status: 400,
          errorCode: "invalid_json_schema",
          errorType: "invalid_request_error",
          requestId: "req_test",
          description: expect.stringContaining(
            "context=('properties', 'portion'), $ref cannot have keywords {'description'}.",
          ),
        },
      ],
    ]);
    const logged = JSON.stringify(warnings);
    expect(logged).not.toContain(apiKey);
    expect(logged).not.toContain(pageText);
  }),
);
