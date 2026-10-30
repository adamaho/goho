import { Ai } from "@goho/core";
import { type Array, Effect, Schema } from "effect";

import { NonEmptyText } from "#src/schema.ts";

/**
 * Cover extraction schema whose category decodes with `category`. Extraction
 * restricts it to the current book category names. The author is required but
 * nullable, so the model must say when the cover credits nobody.
 *
 * @category models
 * @since 0.1.0
 */
export const parsedBookWith = <Category extends Schema.Codec<string, string>>(category: Category) =>
  Schema.Struct({ title: NonEmptyText, author: Schema.NullOr(NonEmptyText), category });

/**
 * Schema of a validated cover extraction, as stored with its upload.
 *
 * @category models
 * @since 0.1.0
 */
export const ParsedBook = parsedBookWith(NonEmptyText);

/**
 * Validated cover extraction.
 *
 * @category models
 * @since 0.1.0
 */
export interface ParsedBook extends Schema.Schema.Type<typeof ParsedBook> {}

/**
 * Version of the cover extraction contract recorded with each processed upload.
 * Version 2 made the author nullable, with the printed publisher standing in for
 * a missing author.
 *
 * @category constants
 * @since 0.1.0
 */
export const extractionVersion = 2;

const systemPrompt = `Extract the book shown on this cover into the required structured book object.
- Return title as the book's title as printed on the cover, without series names, edition labels, or marketing text. Include a subtitle only when the cover prints it as part of the title.
- Return author as the author's name as printed. List several authors in printed order, separated by commas. Always omit illustrators, translators, editors, and other contributors who are not authors.
- When no author is printed, return the publisher's name as printed on the cover instead. When neither an author nor a publisher is printed, return null for author.
- Use only names printed on this cover. Never supply an author or publisher from your own knowledge of the book.
- Give the book exactly one category, choosing the closest fit from the allowed categories supplied with the image.`;

/**
 * Extracts a book's title, author, and category from one cover image. The
 * author falls back to the printed publisher, then null. The category must be
 * one of `categories`; any other value fails as invalid model output.
 *
 * @category workflows
 * @since 0.1.0
 */
export const extract = Effect.fn("@goho/Books.extract")(function* (input: {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly contentType: string;
  readonly categories: Array.NonEmptyReadonlyArray<string>;
}) {
  const ai = yield* Ai.Service;
  return yield* ai.generateObject({
    objectName: "book",
    schema: parsedBookWith(Schema.Literals(input.categories)),
    prompt: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the structured book data from this cover image." },
          {
            type: "text",
            text: `Allowed book categories, as a JSON array: ${JSON.stringify(input.categories)}`,
          },
          {
            type: "file",
            mediaType: input.contentType,
            fileName: input.fileName,
            data: input.bytes,
          },
        ],
      },
    ],
  });
});
