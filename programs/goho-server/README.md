# @goho/goho-server

Exposes receipt uploads, retrieval, creation, health checks,
and API documentation. The server implements the shared
[@goho/goho-api](../../packages/goho-api/README.md) contract, and the CLI connects
through the derived [typed client](../../clients/goho-server/README.md).

The server binds to `127.0.0.1` and requires no authentication. It is intended for local use.

For development and server setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## API

Every successful endpoint returns its payload under a top-level `data` field.

- `GET /health` returns HTTP 200 with `{"data":{"status":"ok"}}` when the HTTP server is running.
  This is a liveness check; it does not query PostgreSQL or OpenAI.
- `GET /openapi.json` serves the OpenAPI contract.
- `GET /docs` serves Swagger UI. Try it out sends real requests to this server.

Open [Swagger docs](http://127.0.0.1:3000/docs) after starting the server with the
default port.

### List receipts

`GET /receipts` returns every persisted receipt and its ordered items under
`data`. Receipts are ordered by receipt date and creation time, newest first.
An empty database returns `{"data":[]}`. A retrieval failure returns HTTP 500
with `{"_tag":"InternalServerError"}`.

### Upload a receipt

`POST /receipt-uploads` accepts one multipart `file` containing a JPEG, PNG, or
WebP image no larger than 20 MB. It stores the original, creates a durable upload
record, queues processing, and immediately returns HTTP 202 with the upload
resource under `data`.

Set `GOHO_UPLOADS_DIRECTORY` to the directory where original receipt files should
be retained. File names are opaque IDs; original names and MIME types are stored
with the upload record in PostgreSQL.

### Get receipt upload status

`GET /receipt-uploads/:uploadId` returns `queued`, `processing`, `succeeded`, or
`failed`. A successful upload includes its generated receipt ID. A failed upload
includes a stable failure code; diagnostic details remain in server logs.

A valid UUID with no matching upload returns HTTP 404. Malformed IDs return HTTP
400, and retrieval failures return HTTP 500.

### Get a receipt

`GET /receipts/:receiptId` returns one complete receipt under `data`. A valid
positive integer ID with no matching receipt returns HTTP 404 with `{"_tag":"NotFound"}`.
A malformed ID returns HTTP 400. Retrieval failures return
HTTP 500 with `{"_tag":"InternalServerError"}`.

### Create a receipt

`POST /receipts` creates a receipt and its ordered items atomically. Supply an
`idempotency-key` header and the JSON body shown in Swagger.

Names are trimmed and decimal strings normalized (`11.00` becomes `11`). Reuse
the same key and normalized data to retrieve the stored receipt with HTTP 200.
Changed data or item order returns HTTP 409. After a lost response, retry with
the same key and data. The complete receipt is returned under `data`.

Invalid headers or payloads return HTTP 400 with an empty body. Conflicts return
`{"_tag":"Conflict"}`; validation or persistence failures return HTTP 500 with
`{"_tag":"InternalServerError"}`.

## Demo receipts

After starting the local server and applying migrations, add four fictional receipts:

```bash
pnpm --filter @goho/goho-server db:seed
```

The script calls the receipt creation API at `http://127.0.0.1:3000` by default.
Set `GOHO_SERVER_URL` to use another server URL. Each fixture has a stable
idempotency key, so rerunning the command returns the same receipts without
creating duplicates. The script does not upload images or call OpenAI.
