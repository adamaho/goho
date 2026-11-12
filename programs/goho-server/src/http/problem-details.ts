import { STATUS_CODES } from "node:http";

import { UploadLimitExceeded } from "@goho/goho-api/response";
import { Effect, Option } from "effect";
import {
  HttpEffect,
  HttpRouter,
  HttpServerRespondable,
  HttpServerResponse,
  ProblemDetails,
} from "effect/http";

const limitProblem = new UploadLimitExceeded({
  detail:
    "Upload exceeds a multipart limit. Send one image up to 20 MB with a total request up to 21 MB.",
});

const isProblem = ({ body }: HttpServerResponse.HttpServerResponse) =>
  body._tag !== "Empty" &&
  body.contentType?.split(";")[0]?.trim().toLowerCase() === ProblemDetails.contentType;

const isUploadRoute = ({ route }: HttpRouter.RouteContext["Service"]) =>
  (route.method === "POST" &&
    (route.path === "/book-uploads" || route.path === "/receipt-uploads")) ||
  (route.method === "PUT" && route.path === "/recipes/:recipeId/image");

const problemFor = (status: number) =>
  Effect.gen(function* () {
    const context = yield* Effect.serviceOption(HttpRouter.RouteContext);
    if (status === 413 && Option.exists(context, isUploadRoute)) {
      return yield* HttpServerRespondable.toResponse(limitProblem);
    }
    const type = ProblemDetails.blankType;
    const title = STATUS_CODES[status];
    return ProblemDetails.toResponse(
      title === undefined ? { type, status } : { type, status, title },
    );
  });

/**
 * Gives every error response without a problem body a generic RFC 9457 problem:
 * `about:blank`, the response status and Node's status text as its title, never
 * the original body. Effect sends empty or plain-text errors for unknown routes,
 * unsupported content types, multipart and other defects, and interruptions,
 * which the Problem Details middleware never sees. Upload-limit 413s on the image upload
 * routes become `UploadLimitExceeded`. Existing problems, successes and client aborts
 * (499, which cannot be delivered) are left alone; status, headers and cookies
 * are kept.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpRouter.middleware(
  (handler) =>
    HttpEffect.withPreResponseHandler(handler, (_request, response) =>
      response.status < 400 || response.status === 499 || isProblem(response)
        ? Effect.succeed(response)
        : problemFor(response.status).pipe(
            Effect.map((problem) => HttpServerResponse.setBody(response, problem.body)),
          ),
    ),
  { global: true },
);
