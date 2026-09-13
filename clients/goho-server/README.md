# @goho/goho-server-client

The Goho server API contract and typed Effect client. Depends on Effect;
Google and OpenAI integrations stay in the server.

- `/api`: HTTP endpoint contract.
- `/receipts`: request validation and public result schemas.
- `/client`: `make(baseUrl)`, deriving the client from the contract.

```ts
import { make } from "@goho/goho-server-client/client";
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

const processReceipts = Effect.gen(function* () {
  const client = yield* make("http://127.0.0.1:3000");
  return yield* client.receipts.process({
    payload: { rootFolderId: "drive-root", spreadsheetId: "sheet-id", concurrency: 5 },
  });
}).pipe(Effect.provide(FetchHttpClient.layer));
```

The folder and spreadsheet IDs above are illustrative placeholders. Replace them
with real IDs. All three HTTP payload fields are required; the CLI’s concurrency
default does not apply to HTTP requests.

Call this effect from the consuming program's runtime. No generated files or
separate code-generation command are needed. Requests are not automatically retried.

`make` delegates directly to Effect's `HttpApiClient.make` with the Goho contract.

See the [server API reference](../../programs/goho-server/README.md#api) for
receipt creation, idempotency, public errors, and batch recovery. The running
server exposes the generated contract at `/openapi.json` and Swagger UI at `/docs`.

To inspect OpenAPI without starting the server or calling providers, run from
this package directory after installing workspace dependencies:

```bash
node --input-type=module -e 'import { api } from "./src/api.ts"; import { OpenApi } from "effect/unstable/httpapi"; console.log(JSON.stringify(OpenApi.fromApi(api), null, 2));'
```

Edit `src/api.ts` and `src/receipts.ts`; the OpenAPI document is generated from
those annotations and schemas. Schema validation also includes runtime checks
that the generated JSON Schema does not fully express, such as real calendar dates.
