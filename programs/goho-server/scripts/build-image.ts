import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";

import { buildImage } from "./image.ts";

// The server's deployable artifact is its container image.
buildImage.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
