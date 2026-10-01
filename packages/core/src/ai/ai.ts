import { Context, Effect, Layer, type Schema } from "effect";
import { AiError, LanguageModel, type Prompt } from "effect/ai";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Options for generating a schema-validated object with the configured language model.
 *
 * @category models
 * @since 0.1.0
 */
export interface GenerateOptions<StructuredOutputSchema extends Schema.Top> {
  readonly prompt: Prompt.RawInput;
  readonly schema: StructuredOutputSchema;
  readonly objectName?: string;
}

/**
 * Error returned when object generation fails.
 *
 * @category errors
 * @since 0.1.0
 */
export type GenerateError = AiError.AiError;

// ---------------------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Language-model operations exposed by the AI service.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly generateObject: <
    ObjectEncoded extends Record<string, unknown>,
    StructuredOutputSchema extends Schema.Encoder<ObjectEncoded, unknown>,
  >(
    options: GenerateOptions<StructuredOutputSchema>,
  ) => Effect.Effect<
    StructuredOutputSchema["Type"],
    GenerateError,
    StructuredOutputSchema["DecodingServices"]
  >;
}

/**
 * Service identifier for AI object generation.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/Ai") {}

/**
 * Constructs the AI service from the configured language model.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const model = yield* LanguageModel.LanguageModel;

  const generateObject: Interface["generateObject"] = Effect.fn("@goho/Ai.generateObject")(
    function* (options) {
      if (options.objectName === undefined) {
        const response = yield* model.generateObject({
          prompt: options.prompt,
          schema: options.schema,
        });
        return response.value;
      }

      const response = yield* model.generateObject({
        prompt: options.prompt,
        schema: options.schema,
        objectName: options.objectName,
      });
      return response.value;
    },
  );

  return Service.of({ generateObject });
});

/**
 * Provides the AI service using the configured language model.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make);
