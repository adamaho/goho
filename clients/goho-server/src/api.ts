import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from "effect/unstable/httpapi";

import { ProcessRequest, ReceiptProcessingResult } from "./receipts.ts";

/**
 * Bearer authentication required by the receipt API.
 *
 * @category models
 * @since 0.1.0
 */
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "@goho/goho-server-client/Authorization",
  {
    error: HttpApiError.Unauthorized,
    security: { bearer: HttpApiSecurity.bearer },
  },
) {}

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
    .middleware(Authorization),
);
