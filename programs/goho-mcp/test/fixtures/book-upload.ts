/**
 * A book cover upload waiting for its scan to be processed.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const queuedBookUpload = {
  id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  fileName: "wonder-cover.webp",
  contentType: "image/webp",
  status: "queued",
  bookId: null,
  failureCode: null,
  createdAt: "2026-11-09 16:20:05.47+00",
  updatedAt: "2026-11-09 16:20:05.47+00",
};

/**
 * A book cover upload whose scan is being processed.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const processingBookUpload = {
  id: "4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8",
  fileName: "matilda-cover.png",
  contentType: "image/png",
  status: "processing",
  bookId: null,
  failureCode: null,
  createdAt: "2026-11-09 16:18:44.02+00",
  updatedAt: "2026-11-09 16:18:44.91+00",
};

/**
 * A book cover upload whose book could not be saved.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const failedBookUpload = {
  id: "6c7d8e9f-0a1b-4c2d-be3f-4a5b6c7d8e9f",
  fileName: "torn-cover.jpg",
  contentType: "image/jpeg",
  status: "failed",
  bookId: null,
  failureCode: "book_creation_failed",
  createdAt: "2026-11-08 20:01:12.75+00",
  updatedAt: "2026-11-08 20:01:20.33+00",
};

/**
 * A book cover upload that saved a book whose ID is above 2^53, so it must stay an exact string.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const succeededBookUpload = {
  id: "3b5f0a8e-2c4d-4e8f-9a1b-6c7d8e9f0a1b",
  fileName: "hobbit-cover.jpg",
  contentType: "image/jpeg",
  status: "succeeded",
  bookId: "9007199254740993",
  failureCode: null,
  createdAt: "2026-10-20 14:03:11.52+00",
  updatedAt: "2026-10-20 14:03:19.07+00",
};
