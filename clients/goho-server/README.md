# @goho/goho-server-client

The typed Effect client for the Goho server. The complete client is derived
from the shared `@goho/goho-api` contract by calling `make(baseUrl)`. Public
receipt, book, book upload, and category schemas and types are re-exported so
consumers only need this package.

```ts
import { make } from "@goho/goho-server-client/client";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";

const listReceipts = Effect.gen(function* () {
  const client = yield* make("http://127.0.0.1:3000");
  const response = yield* client.receipts.list();
  return response.data;
}).pipe(Effect.provide(FetchHttpClient.layer));
```

Call the effect from the consuming program's runtime. Requests are not automatically retried.

See the [server API reference](../../programs/goho-server/README.md#api) for
receipt uploads, retrieval, creation, correction, and deletion, and for books and
their cover uploads. The server exposes OpenAPI at `/openapi.json`
and Swagger UI at `/docs`.

Successful responses use the shared `{ data: ... }` envelope defined by
`@goho/goho-api` and re-exported from this package.

HTTP schema validation failures decode as `HttpApiError.BadRequestProblem` from
`effect/http-api`, not `BadRequest`. Response encoding failures decode as
`HttpApiError.InternalServerErrorProblem`.

Receipt routes fail with `ReceiptNotFound`, `ReceiptItemNotFound`,
`ReceiptImageNotFound`, or `ReceiptsUnavailable`; receipt upload routes fail with
`ReceiptUploadNotFound`, `ReceiptUploadConflict`, or `ReceiptUploadsUnavailable`.
These replace `NotFound`, `Conflict`, and `InternalServerError` on those routes.
They arrive as problem responses, and the client still gives you a `_tag` to branch on:

```ts
client.receipts
  .get({ params: { receiptId } })
  .pipe(Effect.catchTag("ReceiptNotFound", () => Effect.succeed(null)));
```

Book routes fail with `BookNotFound`, `BookImageNotFound`, `BookConflict`, or
`BooksUnavailable`; book upload routes fail with `BookUploadNotFound`,
`BookUploadConflict`, or `BookUploadsUnavailable`. These keep their tags and now
arrive as problem responses too.

Both upload routes also fail with `UploadLimitExceeded`, exported from
`@goho/goho-server-client/response`, when an upload goes over a size or part-count
limit. Its `detail` says what to send instead.

Upgrade the server and CLI/MCP together
when adopting these problem responses; an older server's bodies fail problem decoding.
