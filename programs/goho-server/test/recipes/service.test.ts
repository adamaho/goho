import { it } from "@effect/vitest";
import { type Recipe, RecipeNotFound, RecipesUnavailable } from "@goho/goho-api/recipes";
import { Effect, Layer, Logger, Option } from "effect";
import { expect } from "vitest";

import * as Transaction from "#src/database/transaction.ts";
import { PdfError, type Photo } from "#src/recipes/model.ts";
import * as RecipePdf from "#src/recipes/pdf.ts";
import * as RecipeRepository from "#src/recipes/repository.ts";
import * as Recipes from "#src/recipes/service.ts";
import * as FileStorage from "#src/services/file-storage.ts";
import { recipe } from "#test/recipes/pdf-fixtures.ts";

const fileId = FileStorage.FileId.make("photo-file");
const photoBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const pdfBytes = new TextEncoder().encode("%PDF-1.3");

interface Fixture {
  readonly found?: Option.Option<Recipe>;
  readonly image?: Option.Option<{ readonly contentType: Photo["contentType"] }>;
  readonly storage?: FileStorage.Interface["get"];
  readonly render?: RecipePdf.Interface["render"];
}

// The PDF operation over stub persistence, storage and renderer, recording
// what reaches the renderer and every error log.
const getPdf = ({
  found = Option.some(recipe),
  image = Option.none(),
  storage = () => Effect.die("Unexpected storage read"),
  render = () => Effect.succeed(pdfBytes),
}: Fixture) => {
  const rendered: Array<readonly [Recipe, Option.Option<Photo>]> = [];
  const errors: Array<unknown> = [];
  const layer = Recipes.layer.pipe(
    Layer.provide([
      Layer.mock(RecipeRepository.Service, {
        findById: () => Effect.succeed(found),
        findImage: () =>
          Effect.succeed(Option.map(image, ({ contentType }) => ({ fileId, contentType }))),
      }),
      Layer.mock(FileStorage.Service, { get: storage }),
      Layer.mock(Transaction.Service, {}),
      Layer.succeed(RecipePdf.Service, {
        render: (input, photo) => {
          rendered.push([input, photo]);
          return render(input, photo);
        },
      }),
    ]),
  );
  return Recipes.Service.use((recipes) => recipes.getPdf(recipe.id)).pipe(
    Effect.provide([
      layer,
      Logger.layer([
        Logger.make(({ logLevel, message }) => {
          if (logLevel === "Error") errors.push(message);
        }),
      ]),
    ]),
    Effect.map((result) => ({ result, rendered, errors })),
    Effect.mapError((error) => ({ error, rendered, errors })),
  );
};

it.effect("draws the recipe with its stored photo", () =>
  Effect.gen(function* () {
    const { result, rendered, errors } = yield* getPdf({
      image: Option.some({ contentType: "image/png" }),
      storage: (id) => (id === fileId ? Effect.succeed(photoBytes) : Effect.die(id)),
    });
    expect(result).toEqual({ title: recipe.title, bytes: pdfBytes });
    expect(rendered).toEqual([
      [recipe, Option.some({ bytes: photoBytes, contentType: "image/png" })],
    ]);
    expect(errors).toEqual([]);
  }),
);

it.effect("draws a recipe without a photo without reading storage", () =>
  Effect.gen(function* () {
    const { result, rendered } = yield* getPdf({});
    expect(result.bytes).toBe(pdfBytes);
    expect(rendered).toEqual([[recipe, Option.none()]]);
  }),
);

it.effect("logs a photo file it cannot read and draws the recipe without it", () =>
  Effect.gen(function* () {
    const { result, rendered, errors } = yield* getPdf({
      image: Option.some({ contentType: "image/jpeg" }),
      storage: () => Effect.fail(new FileStorage.StorageError({ operation: "get", cause: "gone" })),
    });
    expect(result.bytes).toBe(pdfBytes);
    expect(rendered).toEqual([[recipe, Option.none()]]);
    expect(errors).toEqual([["Recipe PDF drawn without its unreadable photo", expect.anything()]]);
  }),
);

it.effect("fails a missing recipe as not found, without drawing", () =>
  Effect.gen(function* () {
    const { error, rendered } = yield* Effect.flip(getPdf({ found: Option.none() }));
    expect(error).toBeInstanceOf(RecipeNotFound);
    expect(rendered).toEqual([]);
  }),
);

it.effect("fails a recipe that cannot be drawn as unavailable, and logs why", () =>
  Effect.gen(function* () {
    const { error, errors } = yield* Effect.flip(
      getPdf({ render: () => Effect.fail(new PdfError({ cause: "PDFKit failed" })) }),
    );
    expect(error).toBeInstanceOf(RecipesUnavailable);
    expect(errors).toEqual([["Recipe PDF rendering failed", expect.any(PdfError)]]);
  }),
);
