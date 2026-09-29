import { createServer } from "node:http";

import {
  NodeCrypto,
  NodeFileSystem,
  NodeHttpServer,
  NodePath,
  NodeRuntime,
} from "@effect/platform-node";
import { Config, Layer, Schema } from "effect";
import { HttpRouter } from "effect/unstable/http";

import * as Database from "./database/client.ts";
import * as FileStorage from "./file-storage.ts";
import * as Http from "./http.ts";
import * as ReceiptUploadProcessor from "./receipt-uploads/processor.ts";
import * as ReceiptUploadQueue from "./receipt-uploads/queue.ts";
import * as ReceiptUploadRepository from "./receipt-uploads/repository.ts";
import * as ReceiptUploads from "./receipt-uploads/service.ts";
import * as ReceiptRepository from "./receipts/repository.ts";
import * as Receipts from "./receipts/service.ts";
import * as Ai from "./services/ai.ts";

const RepositoryLive = ReceiptRepository.layer;
const ReceiptUploadRepositoryLive = ReceiptUploadRepository.layer;
const ReceiptUploadQueueLive = ReceiptUploadQueue.layer;
const FileStorageLive = Layer.unwrap(
  Config.String("GOHO_UPLOADS_DIRECTORY").pipe(
    Config.map((directory) => FileStorage.layerFileSystem({ directory })),
  ),
).pipe(Layer.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer]));
const ReceiptsLive = Receipts.layer.pipe(Layer.provide([RepositoryLive, NodeCrypto.layer]));
const ReceiptUploadsLive = ReceiptUploads.layer.pipe(
  Layer.provide([
    FileStorageLive,
    NodeCrypto.layer,
    ReceiptUploadQueueLive,
    ReceiptUploadRepositoryLive,
  ]),
);
const ReceiptUploadWorkerLive = ReceiptUploadProcessor.layer.pipe(
  Layer.provide([
    Ai.layer,
    FileStorageLive,
    ReceiptUploadQueueLive,
    ReceiptUploadRepositoryLive,
    RepositoryLive,
  ]),
);
const ServerLive = HttpRouter.serve(
  Http.layer.pipe(Layer.provide([ReceiptsLive, ReceiptUploadsLive])),
).pipe(
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
Layer.launch(
  Layer.merge(ServerLive, ReceiptUploadWorkerLive).pipe(Layer.provide(Database.layer)),
).pipe(NodeRuntime.runMain);
