import { ErrorResponse } from "@goho/goho-api/response";
import { Effect } from "effect";
import { HttpEffect, HttpRouter, HttpServerResponse } from "effect/http";

const limitError = ErrorResponse.make({
  error: {
    code: "invalid_input",
    message:
      "Upload exceeds a multipart limit. Send one image up to 20 MiB with a total request up to 21 MiB.",
  },
});

/**
 * Gives upload-limit failures the declared JSON body after Effect converts its
 * multipart errors into HTTP responses. Other routes and statuses stay unchanged.
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
        Effect.succeed(
          response.status === 413
            ? HttpServerResponse.jsonUnsafe(limitError, {
                status: 413,
                headers: response.headers,
              })
            : response,
        ),
      );
    }
    return yield* handler;
  }),
).layer;
