import { Schema } from "effect";
import { Multipart } from "effect/http";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
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
import {
  ReceiptUpload,
  ReceiptUploadConflict,
  ReceiptUploadId,
  ReceiptUploadNotFound,
  ReceiptUploadsUnavailable,
} from "./receipt-uploads.ts";
import {
  CreateReceiptRequest,
  PatchReceiptItemRequest,
  PatchReceiptRequest,
  Receipt,
  ReceiptId,
  ReceiptImageNotFound,
  ReceiptItem,
  ReceiptItemId,
  ReceiptItemNotFound,
  ReceiptNotFound,
  ReceiptsUnavailable,
} from "./receipts.ts";
import {
  CreateRecipeUploadRequest,
  RecipeUpload,
  RecipeUploadConflict,
  RecipeUploadId,
  RecipeUploadNotFound,
  RecipeUploadsUnavailable,
} from "./recipe-uploads.ts";
import {
  CreateRecipeRequest,
  Recipe,
  RecipeId,
  RecipeImageNotFound,
  RecipeNotFound,
  RecipesUnavailable,
  RecipeSummary,
} from "./recipes.ts";
import { DataResponse, UploadLimitExceeded } from "./response.ts";

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

// Problem bodies have no name of their own, so OpenAPI would call them `…Encoded`.
const UploadLimitExceededProblem = UploadLimitExceeded.pipe(
  Schema.annotateEncoded({ identifier: "UploadLimitExceeded" }),
);
const ReceiptNotFoundProblem = ReceiptNotFound.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptNotFound" }),
);
const ReceiptItemNotFoundProblem = ReceiptItemNotFound.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptItemNotFound" }),
);
const ReceiptImageNotFoundProblem = ReceiptImageNotFound.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptImageNotFound" }),
);
const ReceiptsUnavailableProblem = ReceiptsUnavailable.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptsUnavailable" }),
);
const ReceiptUploadNotFoundProblem = ReceiptUploadNotFound.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptUploadNotFound" }),
);
const ReceiptUploadConflictProblem = ReceiptUploadConflict.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptUploadConflict" }),
);
const ReceiptUploadsUnavailableProblem = ReceiptUploadsUnavailable.pipe(
  Schema.annotateEncoded({ identifier: "ReceiptUploadsUnavailable" }),
);
const BookNotFoundProblem = BookNotFound.pipe(
  Schema.annotateEncoded({ identifier: "BookNotFound" }),
);
const BookImageNotFoundProblem = BookImageNotFound.pipe(
  Schema.annotateEncoded({ identifier: "BookImageNotFound" }),
);
const BookConflictProblem = BookConflict.pipe(
  Schema.annotateEncoded({ identifier: "BookConflict" }),
);
const BooksUnavailableProblem = BooksUnavailable.pipe(
  Schema.annotateEncoded({ identifier: "BooksUnavailable" }),
);
const BookUploadNotFoundProblem = BookUploadNotFound.pipe(
  Schema.annotateEncoded({ identifier: "BookUploadNotFound" }),
);
const BookUploadConflictProblem = BookUploadConflict.pipe(
  Schema.annotateEncoded({ identifier: "BookUploadConflict" }),
);
const BookUploadsUnavailableProblem = BookUploadsUnavailable.pipe(
  Schema.annotateEncoded({ identifier: "BookUploadsUnavailable" }),
);

const RecipeNotFoundProblem = RecipeNotFound.pipe(
  Schema.annotateEncoded({ identifier: "RecipeNotFound" }),
);
const RecipeImageNotFoundProblem = RecipeImageNotFound.pipe(
  Schema.annotateEncoded({ identifier: "RecipeImageNotFound" }),
);
const RecipesUnavailableProblem = RecipesUnavailable.pipe(
  Schema.annotateEncoded({ identifier: "RecipesUnavailable" }),
);
const RecipeUploadNotFoundProblem = RecipeUploadNotFound.pipe(
  Schema.annotateEncoded({ identifier: "RecipeUploadNotFound" }),
);
const RecipeUploadConflictProblem = RecipeUploadConflict.pipe(
  Schema.annotateEncoded({ identifier: "RecipeUploadConflict" }),
);
const RecipeUploadsUnavailableProblem = RecipeUploadsUnavailable.pipe(
  Schema.annotateEncoded({ identifier: "RecipeUploadsUnavailable" }),
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
    "Runs the receipt playbook: upload and track images, and manage finished receipts, the shared book roster and recipes, by hand, from cover scans or from recipe pages. No authentication required, bud.",
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
            UploadLimitExceededProblem,
            ReceiptUploadsUnavailableProblem.annotate({
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
            ReceiptUploadsUnavailableProblem.annotate({
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
            ReceiptUploadNotFoundProblem,
            ReceiptUploadConflictProblem,
            ReceiptUploadsUnavailableProblem.annotate({
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
            ReceiptUploadNotFoundProblem,
            ReceiptUploadsUnavailableProblem.annotate({
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
            ReceiptsUnavailableProblem.annotate({
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
            ReceiptNotFoundProblem,
            ReceiptsUnavailableProblem.annotate({
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
            ReceiptNotFoundProblem,
            ReceiptsUnavailableProblem.annotate({
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
            ReceiptImageNotFoundProblem,
            ReceiptsUnavailableProblem.annotate({
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
            ReceiptsUnavailableProblem.annotate({
              description: "Receipt validation or persistence missed the net.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
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
            ReceiptNotFoundProblem,
            ReceiptsUnavailableProblem.annotate({
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
            ReceiptItemNotFoundProblem,
            ReceiptsUnavailableProblem.annotate({
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
            BooksUnavailableProblem.annotate({
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
            BookNotFoundProblem,
            BooksUnavailableProblem.annotate({
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
            BooksUnavailableProblem.annotate({
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
            BookNotFoundProblem,
            BookConflictProblem,
            BooksUnavailableProblem.annotate({
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
            BookNotFoundProblem,
            BooksUnavailableProblem.annotate({
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
            BookImageNotFoundProblem,
            BooksUnavailableProblem.annotate({
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
            UploadLimitExceededProblem,
            BookUploadsUnavailableProblem.annotate({
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
            BookUploadsUnavailableProblem.annotate({
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
            BookUploadNotFoundProblem,
            BookUploadsUnavailableProblem.annotate({
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
            BookUploadNotFoundProblem,
            BookUploadConflictProblem,
            BookUploadsUnavailableProblem.annotate({
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
    // Recipes
    HttpApiGroup.make("recipes")
      .annotate(
        OpenApi.Description,
        "Recipes entered by hand or pulled from web pages, with their ingredients and steps.",
      )
      .add(
        HttpApiEndpoint.get("list", "/recipes", {
          success: DataResponse(
            Schema.Array(RecipeSummary).annotate({
              description:
                "Recipe headlines by title A to Z, ignoring case, then newest first; empty when none exist.",
            }),
          ),
          error: [
            RecipesUnavailableProblem.annotate({
              description: "The server could not pull the recipes off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List recipes")
          .annotate(
            OpenApi.Description,
            "Pulls every saved recipe's headline details by title, without ingredients, steps or yield. Get a recipe for the full play.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/recipes/:recipeId", {
          params: { recipeId: RecipeId },
          success: DataResponse(Recipe),
          error: [
            RecipeNotFoundProblem,
            RecipesUnavailableProblem.annotate({
              description: "The server could not retrieve this recipe.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a recipe")
          .annotate(
            OpenApi.Description,
            "Brings back one saved recipe with its ingredients, steps and yield.",
          ),
      )
      .add(
        HttpApiEndpoint.post("create", "/recipes", {
          payload: CreateRecipeRequest,
          success: DataResponse(Recipe),
          error: [
            RecipesUnavailableProblem.annotate({
              description: "The server could not save this recipe; nothing changed.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
          .annotate(OpenApi.Summary, "Add a recipe")
          .annotate(
            OpenApi.Description,
            "Saves a complete recipe straight to the roster, with no source or photo. Every call saves a new recipe, even with a title already on the roster.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/recipes/:recipeId", {
          params: { recipeId: RecipeId },
          success: HttpApiSchema.NoContent,
          error: [
            RecipeNotFoundProblem,
            RecipesUnavailableProblem.annotate({
              description:
                "The server could not delete this recipe and its photo; take another shot to finish the cleanup.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a recipe")
          .annotate(
            OpenApi.Description,
            "Takes the recipe off the roster for good, along with every import linked to it and its photo, so its page can be pulled in fresh. Returns no body after a clean finish.",
          ),
      )
      .add(
        HttpApiEndpoint.get("getImage", "/recipes/:recipeId/image", {
          params: { recipeId: RecipeId },
          success: ImageResponse,
          error: [
            RecipeImageNotFoundProblem,
            RecipesUnavailableProblem.annotate({
              description: "The server could not retrieve this recipe photo.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get a recipe photo")
          .annotate(
            OpenApi.Description,
            "Returns the JPEG, PNG or WebP photo on file for the recipe. Recipes entered by hand have none.",
          ),
      ),
    // Recipe uploads
    HttpApiGroup.make("recipeUploads")
      .annotate(OpenApi.Description, "Recipe imports from web pages and their processing status.")
      .add(
        HttpApiEndpoint.post("create", "/recipe-uploads", {
          payload: CreateRecipeUploadRequest,
          success: DataResponse(RecipeUpload).annotate({ httpApiStatus: 202 }),
          error: [
            RecipeUploadsUnavailableProblem.annotate({
              description: "The server could not save or queue the import; nothing changed.",
            }),
          ],
        })
          .annotate(HttpApi.PayloadParseOptions, strictPayload)
          .annotate(OpenApi.Summary, "Import a recipe from a page")
          .annotate(
            OpenApi.Description,
            "Queues a new import of the page and returns 202 before the page is fetched, every time you send it. A page already saved as a recipe, ignoring its fragment, links that recipe without another fetch, and the recipe keeps the URL it was first saved from. After a miss, just send the page again.",
          ),
      )
      .add(
        HttpApiEndpoint.get("list", "/recipe-uploads", {
          success: DataResponse(Schema.Array(RecipeUpload)),
          error: [
            RecipeUploadsUnavailableProblem.annotate({
              description: "The server could not pull the imports off the bench.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "List recipe imports")
          .annotate(
            OpenApi.Description,
            "Pulls every recipe import off the bench, newest first, with its current status.",
          ),
      )
      .add(
        HttpApiEndpoint.get("get", "/recipe-uploads/:uploadId", {
          params: { uploadId: RecipeUploadId },
          success: DataResponse(RecipeUpload),
          error: [
            RecipeUploadNotFoundProblem,
            RecipeUploadsUnavailableProblem.annotate({
              description: "The server could not retrieve this import.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Get recipe import status")
          .annotate(
            OpenApi.Description,
            "Returns the latest queue or processing status, the recipe ID after a clean finish, and the failure code after a miss.",
          ),
      )
      .add(
        HttpApiEndpoint.delete("delete", "/recipe-uploads/:uploadId", {
          params: { uploadId: RecipeUploadId },
          success: HttpApiSchema.NoContent,
          error: [
            RecipeUploadNotFoundProblem,
            RecipeUploadConflictProblem,
            RecipeUploadsUnavailableProblem.annotate({
              description: "The server could not delete this import.",
            }),
          ],
        })
          .annotate(OpenApi.Summary, "Delete a failed recipe import")
          .annotate(
            OpenApi.Description,
            "Clears a failed import off the bench. You don't need this to take another shot at the page; just send it again. Queued, processing, and succeeded imports return 409; delete the recipe to remove its successful imports.",
          ),
      ),
  )
  .middleware(HttpApiMiddleware.ProblemDetails);
