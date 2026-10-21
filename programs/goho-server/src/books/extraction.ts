import { Ai } from "@goho/core";
import { type Array, Effect, Schema } from "effect";

import { NonEmptyText } from "#src/schema.ts";

/**
 * Cover extraction schema whose category decodes with `category`. Extraction
 * restricts it to the current book category names.
 *
 * @category models
 * @since 0.1.0
 */
export const parsedBookWith = <Category extends Schema.Codec<string, string>>(category: Category) =>
  Schema.Struct({ title: NonEmptyText, author: NonEmptyText, category });

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
 *
 * @category constants
 * @since 0.1.0
 */
export const extractionVersion = 1;

const systemPrompt = `Extract the book shown on this cover into the required structured book object.
- Return title as the book's title as printed on the cover, without series names, edition labels, or marketing text. Include a subtitle only when the cover prints it as part of the title.
- Return author as the author's name as printed. List several authors in printed order, separated by commas; omit illustrators, translators, and editors unless no author is shown.
- Give the book exactly one category, choosing the closest fit from the allowed categories supplied with the image.`;

/**
 * Extracts a book's title, author, and category from one cover image. The
 * category must be one of `categories`; any other value fails as invalid model
 * output.
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
