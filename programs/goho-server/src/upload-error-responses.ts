import { UploadLimitExceeded } from "@goho/goho-api/response";
import { Effect } from "effect";
import { HttpEffect, HttpRouter, HttpServerRespondable, HttpServerResponse } from "effect/http";

const limitProblem = new UploadLimitExceeded({
  detail:
    "Upload exceeds a multipart limit. Send one image up to 20 MB with a total request up to 21 MB.",
});

/**
 * Renders upload-limit failures as their declared problem. Effect's multipart
 * limit errors are defects with an empty 413, which the problem middleware never
 * sees. Other routes and statuses stay unchanged.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpRouter.middleware((handler) =>
  Effect.gen(function* () {
    const { route } = yield* HttpRouter.RouteContext;
    if (
      route.method === "POST" &&
      (route.path === "/book-uploads" || route.path === "/receipt-uploads")
    ) {
      yield* HttpEffect.appendPreResponseHandler((_request, response) =>
        response.status === 413
          ? HttpServerRespondable.toResponse(limitProblem).pipe(
              Effect.map(HttpServerResponse.setHeaders(response.headers)),
            )
          : Effect.succeed(response),
      );
    }
    return yield* handler;
  }),
).layer;
