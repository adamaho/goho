import { Context, Effect, Layer, type Schema } from "effect";
import { AiError, LanguageModel, type Prompt } from "effect/unstable/ai";

// ---------------------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------------------

export interface GenerateOptions<StructuredOutputSchema extends Schema.Top> {
  readonly prompt: Prompt.RawInput;
  readonly schema: StructuredOutputSchema;
  readonly objectName?: string;
}

export type GenerateError = AiError.AiError;

// ---------------------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------------------

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

export class Service extends Context.Service<Service, Interface>()("@goho/Ai") {}

export const make = Effect.gen(function* () {
  const model = yield* LanguageModel.LanguageModel;

  const generateObject = Effect.fn("Ai.generate")(function* (options) {
    const response = yield* model.generateObject({
      prompt: options.prompt,
      schema: options.schema,
      ...(options.objectName === undefined ? {} : { objectName: options.objectName }),
    });

    return response.value;
  });

  return Service.of({ generateObject });
});

export const layer = Layer.effect(Service, make);
