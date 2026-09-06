import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { GoogleDrive, GoogleSheets } from "@goho/core";
import { Config, Effect, Layer, Redacted, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";

import * as Http from "./http.ts";
import * as Receipts from "./receipts/service.ts";
import * as Ai from "./services/ai.ts";
import * as GoogleAuth from "./services/auth.ts";

const GoogleLive = Layer.merge(GoogleDrive.layer, GoogleSheets.layer).pipe(
  Layer.provide(GoogleAuth.layer),
);
const ReceiptsLive = Receipts.layer.pipe(Layer.provide(Layer.merge(GoogleLive, Ai.layer)));
const AuthorizationLive = Layer.unwrap(
  Config.schema(Schema.NonEmptyString, "GOHO_SERVER_TOKEN")
    .pipe(Config.map(Redacted.make))
    .pipe(Effect.map(Http.layerAuthorization)),
);
const ServerLive = HttpRouter.serve(
  Http.layer.pipe(Layer.provide([ReceiptsLive, AuthorizationLive])),
).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.string("GOHO_SERVER_HOST").pipe(Config.withDefault("127.0.0.1")),
      port: Config.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
        "GOHO_SERVER_PORT",
      ).pipe(Config.withDefault(3000)),
    }),
  ),
);
Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
