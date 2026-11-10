/**
 * A receipt upload waiting for its image to be processed.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const queuedReceiptUpload = {
  id: "5d2c8e1a-3b4f-4c6d-9e7f-8a0b1c2d3e4f",
  fileName: "corner-store.webp",
  contentType: "image/webp",
  status: "queued",
  receiptId: null,
  failureCode: null,
  createdAt: "2026-11-09 09:12:40.18+00",
  updatedAt: "2026-11-09 09:12:40.18+00",
};

/**
 * A receipt upload whose image is being processed.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const processingReceiptUpload = {
  id: "8f7e6d5c-4b3a-4291-8f0e-1d2c3b4a5968",
  fileName: "pharmacy.png",
  contentType: "image/png",
  status: "processing",
  receiptId: null,
  failureCode: null,
  createdAt: "2026-11-09 09:10:02.66+00",
  updatedAt: "2026-11-09 09:10:03.01+00",
};

/**
 * A receipt upload that could not be read.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const failedReceiptUpload = {
  id: "2a3b4c5d-6e7f-4a8b-9c0d-e1f2a3b4c5d6",
  fileName: "blurry.jpg",
  contentType: "image/jpeg",
  status: "failed",
  receiptId: null,
  failureCode: "processing_failed",
  createdAt: "2026-11-08 18:45:21.30+00",
  updatedAt: "2026-11-08 18:45:29.84+00",
};

/**
 * A receipt upload that saved a receipt whose ID is above 2^53, so it must stay an exact string.
 *
 * @category fixtures
 * @since 0.1.0
 */
export const succeededReceiptUpload = {
  id: "c4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f",
  fileName: "north-star-market.jpg",
  contentType: "image/jpeg",
  status: "succeeded",
  receiptId: "9007199254740993",
  failureCode: null,
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:19.07+00",
};
