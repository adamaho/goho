# @goho/goho-server-client

The typed Effect client for the Goho server. The complete client is derived
from the shared `@goho/goho-api` contract by calling `make(baseUrl)`. Public
receipt schemas and types are re-exported so consumers only need this package.

```ts
import { make } from "@goho/goho-server-client/client";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const listReceipts = Effect.gen(function* () {
  const client = yield* make("http://127.0.0.1:3000");
  const response = yield* client.receipts.list();
  return response.data;
}).pipe(Effect.provide(FetchHttpClient.layer));
```

Call the effect from the consuming program's runtime. Requests are not automatically retried.

See the [server API reference](../../programs/goho-server/README.md#api) for
receipt uploads, retrieval, and creation. The server exposes OpenAPI at `/openapi.json`
and Swagger UI at `/docs`.

Successful responses use the shared `{ data: ... }` envelope defined by
`@goho/goho-api` and re-exported from this package.
