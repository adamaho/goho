import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi";

import {
  ImportSheetsRawRequest,
  ImportSheetsRawResult,
  ProcessRequest,
  ReceiptProcessingResult,
} from "./receipts.ts";

/**
 * Goho server HTTP contract.
 *
 * @category models
 * @since 0.1.0
 */
export const api = HttpApi.make("goho-server").add(
  HttpApiGroup.make("receipts")
    .add(
      HttpApiEndpoint.post("process", "/receipts/process", {
        payload: ProcessRequest,
        success: Schema.Array(ReceiptProcessingResult),
        error: [HttpApiError.Conflict, HttpApiError.InternalServerError],
      }),
    )
    .add(
      HttpApiEndpoint.post("importSheetsRaw", "/receipts/import-sheets-raw", {
        payload: ImportSheetsRawRequest,
        success: ImportSheetsRawResult,
        error: [HttpApiError.InternalServerError],
      }),
    ),
);
