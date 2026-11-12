import type { Ai } from "@goho/core";
import type { RecipeUrl } from "@goho/goho-api/recipes";
import { Effect, Option } from "effect";

import * as WebFetch from "#src/services/web-fetch.ts";

import * as RecipeExtraction from "./extraction.ts";
import { type ImportedRecipe, ImportError, type Photo, sniffPhotoContentType } from "./model.ts";
import * as Page from "./page.ts";

const pageLimits = { maxBytes: 5 * 1024 * 1024, timeout: "15 seconds" } as const;
const photoLimits = { maxBytes: 10 * 1024 * 1024, timeout: "15 seconds" } as const;

const htmlTypes: ReadonlySet<string> = new Set(["text/html", "application/xhtml+xml"]);

// A recipe never waits on its photo: every failure here is logged and dropped.
const fetchPhoto = (http: WebFetch.Interface, url: string) =>
  http.get({ url, accept: "image/jpeg, image/png, image/webp", ...photoLimits }).pipe(
    Effect.map((response) =>
      Option.map(Option.fromNullishOr(sniffPhotoContentType(response.body)), (contentType) => ({
        bytes: response.body,
        contentType,
      })),
    ),
    Effect.tap((photo) =>
      Option.isNone(photo)
        ? Effect.logWarning("Recipe photo skipped: not a JPEG, PNG or WebP image")
        : Effect.void,
    ),
    Effect.catchTag("GohoServer.WebFetch.FetchError", (error) =>
      Effect.logWarning("Recipe photo skipped", error).pipe(Effect.as(Option.none<Photo>())),
    ),
    Effect.annotateLogs({ photoUrl: url }),
  );

/**
 * Fetches the page at `url`, exactly as given, and extracts its one main
 * recipe, then downloads the page's photo. Only the page and the model can
 * fail the import, with `page_unavailable` for a page that cannot be read as
 * HTML or the failure codes of {@link RecipeExtraction.extract}. Store the photo
 * before saving the recipe; `url`, not where redirects led, stays the
 * recipe's source.
 *
 * @category workflows
 * @since 0.1.0
 */
export const fromUrl: (
  url: RecipeUrl,
) => Effect.Effect<ImportedRecipe, ImportError, WebFetch.Service | Ai.Service> = Effect.fn(
  "@goho/Recipes.fromUrl",
)(function* (url: RecipeUrl) {
  const http = yield* WebFetch.Service;
  const response = yield* http
    .get({ url, accept: "text/html, application/xhtml+xml", ...pageLimits })
    .pipe(
      Effect.mapError(
        (error) =>
          new ImportError({
            failureCode: "page_unavailable",
            retryable: error.retryable,
            cause: error,
          }),
      ),
    );
  const contentType = response.contentType ?? "";
  if (!htmlTypes.has(contentType.split(";")[0]?.trim().toLowerCase() ?? "")) {
    return yield* new ImportError({
      failureCode: "page_unavailable",
      retryable: false,
      cause: `Not an HTML page: ${contentType || "no content type"}`,
    });
  }
  const page = Page.parse(Page.decode(response.body, contentType), response.url);
  const recipe = yield* RecipeExtraction.extract(page);
  const photo =
    page.imageUrl === null ? Option.none<Photo>() : yield* fetchPhoto(http, page.imageUrl);
  return { recipe, photo } satisfies ImportedRecipe;
});
