import { Schema } from "effect";
import { Multipart } from "effect/http";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/http-api";

import {
  BookUpload,
  BookUploadConflict,
  BookUploadId,
  BookUploadNotFound,
  BookUploadsUnavailable,
} from "./book-uploads.ts";
import {
  Book,
  BookConflict,
  BookId,
  BookImageNotFound,
  BookNotFound,
  BooksUnavailable,
  CreateBookRequest,
  PatchBookRequest,
} from "./books.ts";
import { ReceiptUpload, ReceiptUploadId } from "./receipt-uploads.ts";
import {
  CreateReceiptRequest,
  PatchReceiptItemRequest,
  PatchReceiptRequest,
  Receipt,
  ReceiptId,
  ReceiptItem,
  ReceiptItemId,
} from "./receipts.ts";
import { DataResponse } from "./response.ts";

// Payload schemas

// Receipt and book cover uploads share one image upload policy.
const ImageUploadPayload = Schema.Struct({ file: Multipart.SingleFileSchema }).pipe(
  HttpApiSchema.asMultipart({
    maxParts: 1,
    maxFileSize: "20 megabytes",
    maxTotalSize: "21 megabytes",
  }),
);

const ImageResponse = HttpApiSchema.WithHeaders(
  Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" })),
  Schema.Struct({
    "content-type": Schema.String,
    "cache-control": Schema.String,
  }),
).annotate({ httpApiStatus: 200 });

// Corrections reject unsupported fields so a mixed payload never partly saves.
const strictPayload = { onExcessProperty: "error" } as const;

// Built-in error bodies have no name of their own, so OpenAPI would call them `…Encoded`.
const NotFound = HttpApiError.NotFound.pipe(Schema.annotateEncoded({ identifier: "NotFound" }));
const Conflict = HttpApiError.Conflict.pipe(Schema.annotateEncoded({ identifier: "Conflict" }));
const InternalServerError = HttpApiError.InternalServerError.pipe(
  Schema.annotateEncoded({ identifier: "InternalServerError" }),
);

// API groups

/**
 * Goho server HTTP contract.
 *
 * @category models
 * @since 0.1.0
 */
export const api = HttpApi.make("goho-server")
  .annotate(OpenApi.Title, "Goho API")
  .annotate(OpenApi.Version, "0.0.0")
  .annotate(
    OpenApi.Description,
    "Runs the receipt playbook: upload and track images, and manage finished receipts and the shared book roster, by hand or from cover scans. No authentication required, bud.",
  )
  .add(
    // Health
    HttpApiGroup.make("health")
      .annotate(OpenApi.Description, "A quick bench check for server liveness.")
      .add(
        HttpApiEndpoint.get("check", "/health", {
          success: DataResponse(
            Schema.Struct({
              status: Schema.Literal("ok").annotate({
                description: "The server's bench status.",
              }),
            }).annotate({
              identifier: "HealthData",
              description: "Whether the server is awake for the shift.",
              examples: [{ status: "ok" }],
            }),
          ),
        })
          .annotate(OpenApi.Summary, "Check server liveness")
          .annotate(
            OpenApi.Description,
            "Confirms the server is awake; it does not skate over to the database or providers.",
          ),
      ),
    // Receipt uploads
    HttpApiGroup.make("receiptUploads")
      .annotate(OpenApi.Description, "Single-file receipt uploads and their processing status.")
      .add(
        HttpApiEndpoint.post("create", "/receipt-uploads", {
          payload: ImageUploadPayload,
          success: DataResponse(ReceiptUpload).annotate({ httpApiStatus: 202 }),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload is missing a supported receipt image.",
            }),
            InternalServerError.annotate({
              description: "The server could not store or queue the receipt image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Upload a receipt image")
          .annotate(
            OpenApi.Description,
            "Stores one receipt image and returns its queued status before processing starts.",
          ),
      )
      .add(
        HttpApiEndpoint.get("list", "/receipt-uploads", {
          success: DataResponse(Schema.Array(ReceiptUpload)),
          error: [
            InternalServerError.annotate({
              description: "The server could not pull the uploads off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List receipt uploads")
          .annotate(
            OpenApi.Description,
            "Pulls every receipt upload off the bench, newest first, with its current status.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/receipt-uploads/:uploadId", {
          params: { uploadId: ReceiptUploadId },
          success: HttpApiSchema.NoContent,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload ID is not a version 4 UUID; the response body stays empty.",
            }),
            NotFound.annotate({
              description: "No receipt upload is wearing that number, bud.",
            }),
            Conflict.annotate({
              description:
                "Only failed uploads can be deleted; this upload has a different status.",
            }),
            InternalServerError.annotate({
              description: "The server could not delete this upload and its stored image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a failed receipt upload")
          .annotate(
            OpenApi.Description,
            "Clears a failed upload and its original image off the bench. Queued, processing, and succeeded uploads return 409; delete the receipt to remove a successful scan.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/receipt-uploads/:uploadId", {
          params: { uploadId: ReceiptUploadId },
          success: DataResponse(ReceiptUpload),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload ID is not a version 4 UUID; the response body stays empty.",
            }),
            NotFound.annotate({
              description: "No receipt upload is wearing that number, bud.",
            }),
            InternalServerError.annotate({
              description: "The server could not retrieve this receipt upload.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get receipt upload status")
          .annotate(
            OpenApi.Description,
            "Returns the latest queue or processing status and the receipt ID after a clean finish.",
          ),
      ),
    // Receipts
    HttpApiGroup.make("receipts")
      .annotate(OpenApi.Description, "Receipt retrieval, creation, correction, and deletion plays.")
      .add(
        HttpApiEndpoint.get("list", "/receipts", {
          success: DataResponse(
            Schema.Array(Receipt).annotate({
              description: "Complete receipts, newest off the bench first; empty when none exist.",
            }),
          ),
          error: [
            InternalServerError.annotate({
              description: "The server could not pull the receipts off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List receipts")
          .annotate(
            OpenApi.Description,
            "Pulls every saved receipt off the bench, newest first, with its items in position order.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/receipts/:receiptId", {
          params: { receiptId: ReceiptId },
          success: DataResponse(Receipt),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The receipt ID is malformed or out of range; the response body stays empty.",
            }),
            NotFound.annotate({
              description: "No receipt is wearing that number, bud.",
            }),
            InternalServerError.annotate({
              description: "The server could not retrieve this receipt.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a receipt")
          .annotate(
            OpenApi.Description,
            "Brings back one saved receipt with its items lined up by position.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/receipts/:receiptId", {
          params: { receiptId: ReceiptId },
          success: HttpApiSchema.NoContent,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The receipt ID is malformed or out of range; the response body stays empty.",
            }),
            NotFound.annotate({
              description: "No receipt is wearing that number, bud.",
            }),
            InternalServerError.annotate({
              description: "The server could not delete this receipt and its stored image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a receipt")
          .annotate(
            OpenApi.Description,
            "Permanently removes the receipt, items, upload record, original image, and extraction data. Returns no body after a clean finish.",
          ),
      )
      .add(
        HttpApiEndpoint.get("getImage", "/receipts/:receiptId/image", {
          params: { receiptId: ReceiptId },
          success: ImageResponse,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The receipt ID is malformed or out of range; the response body stays empty.",
            }),
            NotFound.annotate({
              description: "No scanned image is linked to this receipt, bud.",
            }),
            InternalServerError.annotate({
              description: "The server could not retrieve this receipt image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a receipt image")
          .annotate(
            OpenApi.Description,
            "Returns the scanned image for an uploaded receipt. Manually created receipts may not have one.",
          ),
      )
      .add(
        HttpApiEndpoint.post("create", "/receipts", {
          payload: CreateReceiptRequest,
          success: DataResponse(Receipt),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The payload is a bad pass; the response body stays empty.",
            }),
            InternalServerError.annotate({
              description: "Receipt validation or persistence missed the net.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Create a receipt")
          .annotate(
            OpenApi.Description,
            "Creates the receipt and items in one clean play, adding any unfamiliar item category to the roster. Every call saves a new receipt.",
          ),
      )
      .add(
        HttpApiEndpoint.patch("patch", "/receipts/:receiptId", {
          params: { receiptId: ReceiptId },
          payload: PatchReceiptRequest,
          success: DataResponse(Receipt),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The correction is a bad pass: empty, unsupported fields, or invalid values. Nothing is saved.",
            }),
            NotFound.annotate({
              description: "No receipt is wearing that number, bud.",
            }),
            InternalServerError.annotate({
              description: "The server could not save this correction; nothing changed.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
          .annotate(OpenApi.Summary, "Correct receipt details")
          .annotate(
            OpenApi.Description,
            "Updates the supplied store name or receipt date and returns the complete receipt. Amounts, currency, and items stay on the bench.",
          ),
      )
      .add(
        HttpApiEndpoint.patch("patchItem", "/receipts/:receiptId/items/:itemId", {
          params: { receiptId: ReceiptId, itemId: ReceiptItemId },
          payload: PatchReceiptItemRequest,
          success: DataResponse(ReceiptItem),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The correction is a bad pass: empty, blank, or unsupported fields, or a malformed ID. Nothing is saved.",
            }),
            NotFound.annotate({
              description: "That receipt has no item wearing this number, bud.",
            }),
            InternalServerError.annotate({
              description: "The server could not save this correction; nothing changed.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
          .annotate(OpenApi.Summary, "Correct a receipt item")
          .annotate(
            OpenApi.Description,
            "Updates the supplied name or category of one existing item and returns just that saved item. An unfamiliar category name joins the roster. Its amount, position, and the rest of the lineup stay put.",
          ),
      ),
    // Books
    HttpApiGroup.make("books")
      .annotate(
        OpenApi.Description,
        "One shared roster of unique books, entered by hand or saved from cover scans.",
      )
      .add(
        HttpApiEndpoint.get("list", "/books", {
          query: {
            search: Schema.optionalKey(
              Schema.String.annotate({
                description:
                  "Text to find in a title or author, ignoring case and extra spaces. Punctuation matches literally; blank lists every book.",
                examples: ["hobbit"],
              }),
            ),
          },
          success: DataResponse(
            Schema.Array(Book).annotate({
              description: "Matching books, newest on the roster first; empty when none match.",
            }),
          ),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The query is a bad pass, such as `search` sent more than once; the response body stays empty.",
            }),
            BooksUnavailable.annotate({
              description: "The server could not pull the books off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List books")
          .annotate(
            OpenApi.Description,
            "Pulls saved books off the bench, newest first. Add `search` to find title or author matches for autocomplete.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/books/:bookId", {
          params: { bookId: BookId },
          success: DataResponse(Book),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The book ID is malformed or out of range; the response body stays empty.",
            }),
            BookNotFound,
            BooksUnavailable.annotate({
              description: "The server could not retrieve this book.",
            }),
          ],
        }).annotate(OpenApi.Summary, "Get a book"),
      )
      .add(
        HttpApiEndpoint.post("create", "/books", {
          payload: CreateBookRequest,
          success: DataResponse(Book),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The payload is a bad pass: missing, blank, or unsupported fields. Nothing is saved.",
            }),
            BooksUnavailable.annotate({
              description: "The server could not save this book; nothing changed.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
          .annotate(OpenApi.Summary, "Add a book")
          .annotate(
            OpenApi.Description,
            "Puts a book on the roster, adding an unfamiliar category too. When a saved book already has that title and author, ignoring case and extra spaces, you get that book back as saved and nothing else changes. A book with no author only matches another with none.",
          ),
      )
      .add(
        HttpApiEndpoint.patch("patch", "/books/:bookId", {
          params: { bookId: BookId },
          payload: PatchBookRequest,
          success: DataResponse(Book),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The correction is a bad pass: empty, blank, or unsupported fields, or a malformed ID. Nothing is saved.",
            }),
            BookNotFound,
            BookConflict,
            BooksUnavailable.annotate({
              description: "The server could not save this correction; nothing changed.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
          .annotate(OpenApi.Summary, "Correct a book")
          .annotate(
            OpenApi.Description,
            "Updates the supplied fields and returns the complete book. An unfamiliar category name joins the roster. Matching another book's title and author returns 409; books are never merged.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/books/:bookId", {
          params: { bookId: BookId },
          success: HttpApiSchema.NoContent,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The book ID is malformed or out of range; the response body stays empty.",
            }),
            BookNotFound,
            BooksUnavailable.annotate({
              description:
                "The server could not delete this book and its stored images; take another shot to finish the cleanup.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a book")
          .annotate(
            OpenApi.Description,
            "Takes the book off the roster for good, along with every successful cover scan of it, their images, and extraction data. Its category stays. Returns no body after a clean finish.",
          ),
      )
      .add(
        HttpApiEndpoint.get("getImage", "/books/:bookId/image", {
          params: { bookId: BookId },
          success: ImageResponse,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description:
                "The book ID is malformed or out of range; the response body stays empty.",
            }),
            BookImageNotFound,
            BooksUnavailable.annotate({
              description: "The server could not retrieve this cover image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a book cover image")
          .annotate(
            OpenApi.Description,
            "Returns the cover scan on file for the book. Books entered by hand have none until a scan of them succeeds.",
          ),
      ),
    // Book uploads
    HttpApiGroup.make("bookUploads")
      .annotate(OpenApi.Description, "Single-file book cover scans and their processing status.")
      .add(
        HttpApiEndpoint.post("create", "/book-uploads", {
          payload: ImageUploadPayload,
          success: DataResponse(BookUpload).annotate({ httpApiStatus: 202 }),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload is missing a supported cover image.",
            }),
            BookUploadsUnavailable.annotate({
              description: "The server could not store or queue the cover image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Upload a book cover")
          .annotate(
            OpenApi.Description,
            "Stores one cover image and returns its queued status before processing starts. A clean scan saves the book, or finds it already on the roster without changing it. No author on the cover? The publisher printed there steps in, and with neither the author stays null.",
          ),
      )
      .add(
        HttpApiEndpoint.get("list", "/book-uploads", {
          success: DataResponse(Schema.Array(BookUpload)),
          error: [
            BookUploadsUnavailable.annotate({
              description: "The server could not pull the cover scans off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List book cover uploads")
          .annotate(
            OpenApi.Description,
            "Pulls every cover scan off the bench, newest first, with its current status.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/book-uploads/:uploadId", {
          params: { uploadId: BookUploadId },
          success: DataResponse(BookUpload),
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload ID is not a version 4 UUID; the response body stays empty.",
            }),
            BookUploadNotFound,
            BookUploadsUnavailable.annotate({
              description: "The server could not retrieve this cover scan.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get book cover upload status")
          .annotate(
            OpenApi.Description,
            "Returns the latest queue or processing status and the book ID after a clean finish.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/book-uploads/:uploadId", {
          params: { uploadId: BookUploadId },
          success: HttpApiSchema.NoContent,
          error: [
            HttpApiError.BadRequestNoContent.annotate({
              description: "The upload ID is not a version 4 UUID; the response body stays empty.",
            }),
            BookUploadNotFound,
            BookUploadConflict,
            BookUploadsUnavailable.annotate({
              description: "The server could not delete this scan and its stored image.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a failed book cover upload")
          .annotate(
            OpenApi.Description,
            "Clears a failed scan and its original image off the bench. Queued, processing, and succeeded scans return 409; delete the book to remove its successful scans.",
          ),
      ),
  );
