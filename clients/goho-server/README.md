# @goho/goho-server-client

The Goho server API contract and typed Effect client. Depends on Effect;
Google and OpenAI integrations stay in the server.

- `/api`: HTTP endpoint contract.
- `/receipts`: request validation and public result schemas.
- `/response`: shared successful response envelope schema, type, and constructor.
- `/client`: `make(baseUrl)`, deriving the client from the contract.

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

Successful responses use the shared `{ data: ... }` envelope. The contract is
defined in `src/api.ts`, `src/receipts.ts`, and `src/response.ts`. To inspect the
generated OpenAPI document, run from this package directory:

```bash
node --input-type=module -e 'import { api } from "./src/api.ts"; import { OpenApi } from "effect/unstable/httpapi"; console.log(JSON.stringify(OpenApi.fromApi(api), null, 2));'
```
