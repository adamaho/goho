import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Ai } from "@goho/core";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

const OpenAiClientLive = OpenAiClient.layerConfig({
  apiKey: Config.Redacted("OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

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
