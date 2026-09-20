# @goho/goho-server-client

The typed Effect client for the Goho server. The complete client is derived
from the shared `@goho/goho-api` contract by calling `make(baseUrl)`.

```ts
import { make } from "@goho/goho-server-client/client";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const processReceipts = Effect.gen(function* () {
  const client = yield* make("http://127.0.0.1:3000");
  const response = yield* client.receipts.process({
    payload: { rootFolderId: "drive-root", spreadsheetId: "sheet-id", concurrency: 5 },
  });
  return response.data;
}).pipe(Effect.provide(FetchHttpClient.layer));
```

Replace the example folder and spreadsheet IDs with real IDs. Call the effect
from the consuming program's runtime. Requests are not automatically retried.

See the [server API reference](../../programs/goho-server/README.md#api) for
receipt retrieval, creation, and batch recovery. The server exposes OpenAPI at `/openapi.json`
and Swagger UI at `/docs`.

Successful responses use the shared `{ data: ... }` envelope defined by
`@goho/goho-api`.
