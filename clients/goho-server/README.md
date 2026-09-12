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

The client also exposes `receipts.importSheetsRaw` for the one-shot RAW import.

Call this effect from the consuming program's runtime. No generated files or
separate code-generation command are needed. Requests are not automatically retried.

`make` delegates directly to Effect's `HttpApiClient.make` with the Goho contract.
