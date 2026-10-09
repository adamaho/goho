import { createServer } from "node:http";

import {
  NodeCrypto,
  NodeFileSystem,
  NodeHttpServer,
  NodePath,
  NodeRuntime,
} from "@effect/platform-node";
import { Config, Layer, Schema } from "effect";
import { HttpRouter } from "effect/http";

import * as Database from "./database/client.ts";
import * as Transaction from "./database/transaction.ts";
import * as FileStorage from "./file-storage.ts";
import * as Http from "./http.ts";
import * as ReceiptUploadQueue from "./receipt-uploads/queue.ts";
import * as ReceiptUploadRepository from "./receipt-uploads/repository.ts";
import * as ReceiptUploads from "./receipt-uploads/service.ts";
import * as ReceiptUploadWorker from "./receipt-uploads/worker.ts";
import * as ReceiptRepository from "./receipts/repository.ts";
import * as Receipts from "./receipts/service.ts";
import * as Ai from "./services/ai.ts";

const RepositoryLive = ReceiptRepository.layer.pipe(Layer.provide(Database.layer));

const ReceiptUploadRepositoryLive = ReceiptUploadRepository.layer.pipe(
  Layer.provide(Database.layer),
);

const ReceiptUploadQueueLive = ReceiptUploadQueue.layer.pipe(Layer.provide(Database.layer));

const TransactionLive = Transaction.layer.pipe(Layer.provide(Database.layer));

const FileStorageLive = Layer.unwrap(
  Config.String("GOHO_UPLOADS_DIRECTORY").pipe(
    Config.map((directory) => FileStorage.layerFileSystem({ directory })),
  ),
).pipe(Layer.provide([NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer]));

const ReceiptsLive = Receipts.layer.pipe(
  Layer.provide([RepositoryLive, FileStorageLive, TransactionLive]),
);

const ReceiptUploadsLive = ReceiptUploads.layer.pipe(
  Layer.provide([
    FileStorageLive,
    NodeCrypto.layer,
    ReceiptUploadQueueLive,
    ReceiptUploadRepositoryLive,
    TransactionLive,
  ]),
);

const ReceiptUploadWorkerLive = ReceiptUploadWorker.layer.pipe(
  Layer.provide([
    Ai.layer,
    FileStorageLive,
    ReceiptUploadQueueLive,
    ReceiptUploadRepositoryLive,
    RepositoryLive,
    TransactionLive,
  ]),
);

const ServerLive = HttpRouter.serve(
  Http.layer.pipe(Layer.provide([ReceiptsLive, ReceiptUploadsLive])),
).pipe(
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      host: Config.String("GOHO_SERVER_HOST").pipe(Config.withDefault("127.0.0.1")),
      port: Config.schema(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
        "GOHO_SERVER_PORT",
      ).pipe(Config.withDefault(3000)),
    }),
  ),
);
Layer.launch(Layer.merge(ServerLive, ReceiptUploadWorkerLive)).pipe(NodeRuntime.runMain);
