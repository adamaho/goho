import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { GoogleDrive, GoogleSheets } from "@goho/core";
import { Config, Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";

import * as Database from "./database/client.ts";
import * as Http from "./http.ts";
import * as ReceiptRepository from "./receipts/repository.ts";
import * as Receipts from "./receipts/service.ts";
import * as Ai from "./services/ai.ts";
import * as GoogleAuth from "./services/auth.ts";

const GoogleLive = Layer.merge(GoogleDrive.layer, GoogleSheets.layer).pipe(
  Layer.provide(GoogleAuth.layer),
);
const RepositoryLive = ReceiptRepository.layer.pipe(Layer.provide(Database.layer));
const ReceiptsLive = Receipts.layer.pipe(Layer.provide([GoogleLive, Ai.layer, RepositoryLive]));
const ServerLive = HttpRouter.serve(Http.layer.pipe(Layer.provide(ReceiptsLive))).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.succeed("127.0.0.1"),
      port: Config.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
        "GOHO_SERVER_PORT",
      ).pipe(Config.withDefault(3000)),
    }),
  ),
);
Layer.launch(ServerLive).pipe(NodeRuntime.runMain);
