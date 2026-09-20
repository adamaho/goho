# Receipt uploads

Goho will accept one receipt file at a time, return immediately, and process it in the
background. An upload is not a receipt until processing succeeds.

## User flow

1. `goho receipts upload <path>` sends one JPEG, PNG, or WebP file.
2. The server stores the original through an injectable `FileStorage` Effect service.
3. The server creates a `receipt_uploads` row and enqueues its ID for processing.
4. The CLI returns the upload ID immediately.
5. `goho receipts status <upload-id>` reports `queued`, `processing`, `succeeded`, or
   `failed`. A successful upload includes the resulting receipt ID.
6. `goho receipts view <receipt-id>` shows the finished receipt.

The upload UUID is also the persisted queue job ID. Receipt IDs remain database-generated
BIGINT values. These identities are intentionally separate because failed uploads never
become receipts.

## Storage and processing

`FileStorage` owns `put` and `get`; callers only retain its branded file ID and do not know
which provider backs it. The first production layer stores files in Google Drive. Future S3 or
R2 layers can replace Drive without changing the upload workflow.

Production uploads go into a dedicated Google Drive folder named `uploads`. Its ID is supplied
through `GOOGLE_DRIVE_UPLOAD_FOLDER_ID`; the service account must have Editor access to that
folder. Goho uses the ID directly instead of finding or creating a folder by name.

Consumers depend only on `FileStorage.Service`. The application composition root constructs
`FileStorage.layerGoogleDrive({ folderId })`, provides its `GoogleDrive.Service` dependency,
and then provides the resulting `FileStorage.Service` to the upload workflow. Another adapter
can replace it by constructing a layer for the same service tag, leaving consumers unchanged.

The processing queue is durable and SQL-backed. One worker claims an upload, marks it
`processing`, extracts and saves a receipt with the existing receipt service, then marks the
upload `succeeded` with its receipt ID. Exhausted work is marked `failed` with a stable
failure code; provider and diagnostic details remain in logs.
Retries may re-enter `processing`, so processing and receipt creation must be idempotent.

## HTTP resources

- `POST /receipt-uploads` accepts one multipart file and returns the upload resource.
- `GET /receipt-uploads/:uploadId` returns its current status and receipt ID when successful.
- Existing receipt endpoints continue to operate only on completed receipts.

## Delivery plan

Each pull request starts from the updated `dev` branch and is merged before the next begins.

1. Add the upload model, database migration, repository, and integration tests. Refresh
   Effect and its sibling packages to the latest release candidate.
2. Add the `FileStorage` service, Google Drive layer, and tests.
3. Add the persisted queue, worker, upload and status endpoints, and runtime wiring. Read
   `GOOGLE_DRIVE_UPLOAD_FOLDER_ID` at the composition root and provide the Google Drive-backed
   `FileStorage` layer. Test the immediate response, state transitions, retries, and failure
   path.
4. Add `receipts upload` and `receipts status`; rename `receipts show` to `receipts view`
   without a compatibility alias. Update CLI documentation and tests.
