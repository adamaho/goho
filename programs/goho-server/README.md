# @goho/goho-server

Exposes receipt uploads, retrieval, creation, deletion, health checks,
and API documentation. The server implements the shared
[@goho/goho-api](../../packages/goho-api/README.md) contract, and the CLI connects
through the derived [typed client](../../clients/goho-server/README.md).

The server binds to `127.0.0.1` by default and requires no authentication. It is intended
for local use or a private network; see the [deployment guide](./CONTRIBUTING.md#deployment).

For development and server setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## API

JSON resource responses return their payload under a top-level `data` field.

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

### Delete a failed receipt upload

`DELETE /receipt-uploads/:uploadId` permanently removes a failed upload and its
original photo. It returns HTTP 204 with no response body. Failed uploads have
`status: "failed"` and a failure code after the worker exhausts its three attempts.

Queued, processing, and succeeded uploads return HTTP 409 with
`{"_tag":"Conflict"}`. To remove a successful scan and its photo, delete its
receipt instead. Missing or previously deleted uploads return HTTP 404, and
malformed UUIDs return HTTP 400.

Database or photo cleanup failures return HTTP 500. Database changes roll back
so cleanup can be retried; an already missing photo does not block deletion.
As with receipt deletion, a commit failure after photo removal can leave the
upload without its photo until deletion is retried.

### Get a receipt

`GET /receipts/:receiptId` returns one complete receipt under `data`. A valid
positive integer ID with no matching receipt returns HTTP 404 with `{"_tag":"NotFound"}`.
A malformed ID returns HTTP 400. Retrieval failures return
HTTP 500 with `{"_tag":"InternalServerError"}`.

### Create a receipt

`POST /receipts` creates a receipt and its ordered items atomically from the
JSON body shown in Swagger. Every successful call saves a new receipt.

Names are trimmed and decimal strings normalized (`11.00` becomes `11`). The
complete receipt is returned under `data`.

Invalid payloads return HTTP 400 with an empty body; validation or persistence
failures return HTTP 500 with `{"_tag":"InternalServerError"}`.

### Delete a receipt

`DELETE /receipts/:receiptId` permanently removes the receipt, its items, linked
upload record, original photo, and stored extraction data. It returns HTTP 204
with no response body. Manually created receipts can also be deleted.

A missing or previously deleted receipt returns HTTP 404. Malformed IDs return
HTTP 400. Database or photo cleanup failures return HTTP 500; database changes
roll back so deletion can be retried. An already missing photo does not block deletion.

Photo storage does not participate in the database transaction. If the database
commit fails after photo removal, the receipt may remain without its photo;
retrying deletion completes the cleanup.
