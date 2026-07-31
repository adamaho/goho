import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Ai } from "@goho/core";
import { Config, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const OpenAiClientLive = OpenAiClient.layerConfig({
  apiKey: Config.redacted("OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const OpenAiLanguageModelLive = Layer.unwrap(
  Config.string("OPENAI_MODEL").pipe(Effect.map(OpenAiLanguageModel.model)),
).pipe(Layer.provide(OpenAiClientLive));

export const AiLive = Ai.layer.pipe(Layer.provide(OpenAiLanguageModelLive));
