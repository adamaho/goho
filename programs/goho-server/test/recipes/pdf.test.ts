import { randomFillSync } from "node:crypto";
import { crc32 } from "node:zlib";

import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import type { Ingredient, Quantity, Recipe, RecipeUnit, RecipeYield } from "@goho/goho-api/recipes";
import { Effect, Fiber, FileSystem, Layer, Logger, Option, Path, Tracer } from "effect";
import * as fontkit from "fontkit";
// pdf.js ships a legacy build for runtimes without its newest JavaScript
// features; Node 26 lacks Math.sumPrecise, which the default build uses.
// oxlint-disable-next-line nopeus/no-cross-package-internals
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { expect } from "vitest";

import type { Photo } from "#src/recipes/model.ts";
import * as RecipePdf from "#src/recipes/pdf.ts";
import { longRecipe, recipe } from "#test/recipes/pdf-fixtures.ts";

// Geist Regular's own advance width for the text, in points.
const geistWidth = Effect.fnUntraced(function* (text: string, size: number) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = yield* path.fromFileUrl(
    new URL("../../assets/fonts/Geist-Regular.ttf", import.meta.url),
  );
  const font = fontkit.create(Buffer.from(yield* fileSystem.readFile(file)));
  return "fonts" in font ? 0 : (font.layout(text).advanceWidth / font.unitsPerEm) * size;
});

interface Item {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Page {
  readonly width: number;
  readonly height: number;
  readonly items: ReadonlyArray<Item>;
  /** Each drawn image's pixel size, and the left edge and size it is drawn at, in points. */
  readonly images: ReadonlyArray<{
    readonly width: number;
    readonly height: number;
    readonly drawn: readonly [x: number, width: number, height: number];
  }>;
}

// Reads the PDF with pdf.js, an independent parser, rather than trusting PDFKit.
const parse = (bytes: Uint8Array) =>
  Effect.tryPromise(async () => {
    const task = getDocument({ data: new Uint8Array(bytes) });
    const document = await task.promise;
    const pages: Array<Page> = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
      const content = await page.getTextContent();
      const operators = await page.getOperatorList();
      pages.push({
        width: right - left,
        height: top - bottom,
        // pdf.js adds a space item for each gap; one narrower than a word
        // space is a mark's padding, not a space in the text.
        items: content.items.flatMap((item) =>
          "str" in item && item.str !== "" && (item.str.trim() !== "" || item.width >= 2.5)
            ? [
                {
                  text: item.str,
                  x: Number(item.transform[4]),
                  y: Number(item.transform[5]),
                  width: item.width,
                  height: item.height,
                },
              ]
            : [],
        ),
        images: operators.fnArray.flatMap((operator, index) => {
          if (operator !== OPS.paintImageXObject) return [];
          const [, width, height] = operators.argsArray[index] ?? [];
          // PDFKit places an image with one transform just before drawing it.
          const placement = operators.fnArray.lastIndexOf(OPS.transform, index);
          const [a, , , d, x] = (operators.argsArray[placement] ?? []).map(Number);
          return [
            {
              width: Number(width),
              height: Number(height),
              drawn: [x ?? 0, a ?? 0, Math.abs(d ?? 0)] as const,
            },
          ];
        }),
      });
    }
    const { info } = await document.getMetadata();
    await task.destroy();
    return { pages, title: "Title" in info ? info.Title : undefined };
  });

// Text lines from top to bottom, taking baselines within 2pt as one line, such
// as a step number and its text. Pieces further apart than a space, such as
// stat columns or the footer, are joined with “ | ”.
const lines = (page: Page) => {
  const rows: Array<{ y: number; items: Array<Item> }> = [];
  for (const item of [...page.items].sort((a, b) => b.y - a.y)) {
    const row = rows.at(-1);
    if (row !== undefined && row.y - item.y <= 2) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.map(({ items }) =>
    [...items]
      .sort((a, b) => a.x - b.x)
      .reduce<{ text: string; end: number | null }>(
        (line, item) => ({
          text: line.text + (line.end !== null && item.x - line.end > 8 ? " | " : "") + item.text,
          end: item.x + item.width,
        }),
        { text: "", end: null },
      )
      .text.trim(),
  );
};

const render = (input: Recipe, photo: Option.Option<Photo> = Option.none()) =>
  Effect.gen(function* () {
    const pdf = yield* RecipePdf.Service;
    const warnings: Array<unknown> = [];
    const bytes = yield* pdf.render(input, photo).pipe(
      Effect.provide(
        Logger.layer([
          Logger.make(({ message, logLevel }) => {
            if (logLevel === "Warn") warnings.push(message);
          }),
        ]),
      ),
    );
    return { bytes, warnings, ...(yield* parse(bytes)) };
  }).pipe(Effect.provide(RecipePdf.layer.pipe(Layer.provide(NodeServices.layer))));

const photoOf = (bytes: Uint8Array, contentType: Photo["contentType"]) =>
  Option.some({ bytes, contentType });

// A landscape scene, 3:2 unless told otherwise.
const scene = (width = 2400, height = 1600) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 120, b: 60, alpha: 0.5 } },
  });

const image = (build: () => Promise<Buffer>) => Effect.tryPromise(build);

it.effect("renders the whole recipe as the app words it, without its source", () =>
  Effect.gen(function* () {
    const { pages, title, warnings } = yield* render(recipe);

    expect(title).toBe("Crème Fraîche Lemon Orzo");
    expect(warnings).toEqual([]);
    expect(pages.flatMap(lines)).toEqual([
      "Crème Fraîche Lemon Orzo",
      "1 hr 10 min | 4–6 servings",
      "Total | Makes",
      "Ingredients",
      "2½ cups chicken stock",
      "453.59 g orzo",
      "1–2 cups milk",
      "3–6 tbsp unsalted butter, cubed",
      "3 eggs",
      "0.2 tsp lemon zest",
      "<0.01 g saffron",
      "1 cup crème fraîche",
      "½ jalapeño, minced",
      "salt (to taste)",
      "Steps",
      "1 Heat the oven to 350°F (175°C). Bring 1¼ cups chicken stock to a simmer.",
      "2 Melt 1–2 tbsp unsalted butter, cubed, then stir in 453.59 g orzo and ½ of salt (to taste).",
      // pdf.js reads runs of spaces as one; the width below shows both were drawn.
      "3 Whisk 3 eggs with ½–1 cup milk, 1 cup crème fraîche and a good squeeze of lemon. Season",
      "with salt (to taste).",
      "Goho",
    ]);
    expect(pages.flatMap(lines).join("\n")).not.toMatch(/examplekitchen|http|lemon-orzo/);

    const spaced = pages[0]?.items.find((item) => item.text.startsWith("of lemon."));
    expect(spaced?.width).toBeCloseTo(yield* geistWidth("of lemon.  Season", 11), 2);
  }).pipe(Effect.provide(NodeServices.layer)),
);

// Expected wording follows the Android app's RecipeText.kt and its en strings,
// with en-CA number formats.
const exact = (numerator: number, denominator = 1): Quantity => ({
  kind: "exact",
  value: { numerator, denominator },
});

const range = (min: readonly [number, number], max: readonly [number, number]): Quantity => ({
  kind: "range",
  min: { numerator: min[0], denominator: min[1] },
  max: { numerator: max[0], denominator: max[1] },
});

const amounts: ReadonlyArray<readonly [Quantity, RecipeUnit, string]> = [
  [exact(2), "cup", "2 cups"],
  [exact(1), "cup", "1 cup"],
  [exact(1, 2), "cup", "½ cup"],
  [exact(5, 2), "cup", "2½ cups"],
  [exact(2, 3), "cup", "⅔ cup"],
  [exact(15, 8), "cup", "1⅞ cups"],
  [exact(4, 8), "tablespoon", "½ tbsp"],
  [exact(1, 5), "cup", "0.2 cup"],
  [exact(6, 5), "cup", "1.2 cups"],
  [exact(251, 250), "cup", "1 cup"],
  [exact(1, 16), "teaspoon", "0.06 tsp"],
  [exact(3, 2), "gram", "1.5 g"],
  [exact(1, 2), "litre", "0.5 L"],
  [exact(1, 3), "gram", "0.33 g"],
  [exact(1, 200), "gram", "0.01 g"],
  [exact(1, 201), "gram", "<0.01 g"],
  [exact(1000), "millilitre", "1,000 mL"],
  [exact(45_359_237, 100_000), "gram", "453.59 g"],
  [exact(5, 4), "kilogram", "1.25 kg"],
  [exact(3, 2), "count", "1½"],
  [exact(12_345), "count", "12,345"],
  [exact(2), "clove", "2 cloves"],
  [exact(1), "bunch", "1 bunch"],
  [exact(3), "pinch", "3 pinches"],
  [exact(2), "dash", "2 dashes"],
  [exact(3, 2), "handful", "1½ handfuls"],
  [exact(1, 2), "knob", "½ knob"],
  [exact(2), "can", "2 cans"],
  [range([1, 1], [2, 1]), "cup", "1–2 cups"],
  [range([1, 2], [1, 1]), "cup", "½–1 cup"],
  [range([1001, 1000], [1002, 1000]), "gram", "1 g"],
  [range([1, 3], [2, 3]), "gram", "0.33–0.67 g"],
];

const portion = (ingredientId: string, numerator = 1, denominator = 1) =>
  ({
    kind: "mark",
    content: { kind: "ingredient", ingredientId, portion: { numerator, denominator } },
  }) as const;

it.effect("words every amount, mark, total time and yield as the app does", () =>
  Effect.gen(function* () {
    const marked: readonly [Ingredient, ...Array<Ingredient>] = [
      { id: "stock", name: "stock", quantity: exact(2), unit: "cup" },
      { id: "butter", name: "butter", quantity: range([3, 1], [6, 1]), unit: "tablespoon" },
      { id: "milk", name: "milk", quantity: exact(1), unit: "cup" },
      { id: "rice", name: "rice", quantity: exact(100), unit: "gram" },
      { id: "salt", name: "salt", quantity: { kind: "text", text: "to taste" }, unit: null },
    ];
    const { pages } = yield* render({
      ...recipe,
      ingredients: [
        ...marked,
        ...amounts.map(([quantity, unit], index): Ingredient => ({
          id: `amount-${index}`,
          name: "flour",
          quantity,
          unit,
        })),
      ],
      steps: [
        {
          segments: [
            { kind: "text", text: "Melt " },
            portion("butter", 1, 3),
            { kind: "text", text: " with " },
            portion("stock", 1, 2),
            { kind: "text", text: ",\n" },
            portion("milk", 1, 3),
            { kind: "text", text: ", " },
            portion("milk", 2, 5),
            { kind: "text", text: ", " },
            portion("rice", 1, 3),
            { kind: "text", text: " and " },
            { kind: "mark", content: { kind: "text", text: "a good squeeze" } },
            { kind: "text", text: "." },
          ],
        },
        {
          segments: [
            portion("salt"),
            { kind: "text", text: ", " },
            portion("salt", 1, 2),
            { kind: "text", text: ", " },
            portion("salt", 1, 5),
            { kind: "text", text: " and " },
            // No ingredient has this ID, so the mark is left out, as the app does.
            portion("eggs"),
            { kind: "text", text: "done." },
          ],
        },
      ],
    });
    // Without the page footers, as the list runs onto a second page.
    const text = pages.flatMap((page) => lines(page).slice(0, -1));

    expect(text.slice(text.indexOf("Ingredients") + 1, text.indexOf("Steps"))).toEqual([
      "2 cups stock",
      "3–6 tbsp butter",
      "1 cup milk",
      "100 g rice",
      "salt (to taste)",
      ...amounts.map(([, , amount]) => `${amount} flour`),
    ]);
    // Marks scale numbers by their portion before rounding, both ends of a range.
    expect(text.slice(text.indexOf("Steps") + 1)).toEqual([
      "1 Melt 1–2 tbsp butter with 1 cup stock,",
      "⅓ cup milk, 0.4 cup milk, 33.33 g rice and a good squeeze.",
      "2 salt (to taste), ½ of salt (to taste), 0.2 of salt (to taste) and done.",
    ]);

    const stats: ReadonlyArray<readonly [number, RecipeYield | null, string]> = [
      [0, { quantity: exact(4), label: "servings" }, "0 min | 4 servings"],
      [1, { quantity: exact(3, 2), label: "loaves" }, "<1 min | 1½ loaves"],
      [59, { quantity: exact(6, 5), label: "litres" }, "<1 min | 1.2 litres"],
      [60, { quantity: range([4, 1], [6, 1]), label: "servings" }, "1 min | 4–6 servings"],
      [
        89,
        { quantity: { kind: "text", text: "about 2 dozen" }, label: "cookies" },
        "1 min | cookies (about 2 dozen)",
      ],
      [90, null, "2 min"],
      [1500, null, "25 min"],
      [3599, null, "1 hr"],
      [3629, null, "1 hr"],
      [3630, null, "1 hr 1 min"],
      [7200, null, "2 hr"],
      [3_600_000, null, "1,000 hr"],
    ];
    const statLines = yield* Effect.forEach(stats, ([totalTimeSeconds, recipeYield]) =>
      render({ ...recipe, totalTimeSeconds, yield: recipeYield }).pipe(
        Effect.map(({ pages: [first] }) => (first === undefined ? [] : lines(first))[1]),
      ),
    );
    expect(statLines).toEqual(stats.map(([, , line]) => line));
  }),
);

it.effect("lays long recipes over several Letter pages without overlap or clipping", () =>
  Effect.gen(function* () {
    const { pages } = yield* render(longRecipe);
    const text = pages.map(lines);

    expect(pages.length).toBeGreaterThanOrEqual(3);
    for (const [index, page] of pages.entries()) {
      expect([page.width, page.height]).toEqual([612, 792]);
      expect(text[index]?.at(-1)).toBe(`Goho Page ${index + 1} of ${pages.length}`);
      // Everything sits within the ¾-inch margins, the footer on its ½-inch line.
      // Heights are em boxes, which reach a little above the title's tight line.
      for (const item of page.items) {
        expect(item.x).toBeGreaterThanOrEqual(54 - 0.01);
        expect(item.x + item.width).toBeLessThanOrEqual(612 - 54 + 0.01);
        expect(item.y).toBeGreaterThanOrEqual(36 - 0.01);
        expect(item.y + item.height).toBeLessThanOrEqual(792 - 54 + 2);
      }
      // No two pieces of text share any space.
      const boxes = page.items.map((item) => ({ ...item, top: item.y + item.height * 0.8 }));
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart =
            a.x + a.width <= b.x + 0.01 ||
            b.x + b.width <= a.x + 0.01 ||
            a.top <= b.y - b.height * 0.2 ||
            b.top <= a.y - a.height * 0.2;
          expect(apart, `${a.text} overlaps ${b.text}`).toBe(true);
        }
      }
    }

    const all = text.flat();
    // The title wraps rather than shrinking, and every ingredient and step is drawn.
    expect(all.slice(0, 4).join(" ")).toBe(longRecipe.title);
    expect(all).toContain("<1 min | pieces (about 2 dozen)");
    const listed = all.slice(all.indexOf("Ingredients"), all.indexOf("Steps"));
    expect(
      listed.flatMap((line) => /^\S+ (?:cups?|g) ingredient (\d+)/.exec(line)?.[1] ?? []),
    ).toEqual(longRecipe.ingredients.map((_, index) => `${index + 1}`));
    expect(all.filter((line) => /^(\d+) (Step \1:|Line one)/.test(line))).toHaveLength(24);
    // A hard line break starts a new line, and an unbreakable word breaks to fit.
    expect(all).toContain("4 Line one of step 4.");
    expect(all).toContain("Line two after a break, then");
    expect(all.join("")).toContain("Supercalifragilisticexpialidocious".repeat(4));
  }),
);

it.effect("keeps each heading on the page of its first lines", () =>
  Effect.gen(function* () {
    // Each added ingredient moves Steps further down page 2. With 36
    // ingredients it fits there with its step's first two lines; with 37 only
    // one line would fit under it, and with 38 none, so both move it to page 3.
    const photo = photoOf(yield* image(() => scene(600, 400).jpeg().toBuffer()), "image/jpeg");
    const counts = [36, 37, 38];
    const drawn = yield* Effect.forEach(counts, (count) =>
      render(
        {
          ...longRecipe,
          ingredients: [longRecipe.ingredients[0], ...longRecipe.ingredients.slice(1, count)],
        },
        photo,
      ),
    );

    const pageEnds = drawn.flatMap(({ pages }) => pages.map((page) => lines(page).at(-2)));
    expect(pageEnds).not.toContain("Steps");
    expect(pageEnds).not.toContain("Ingredients");
    // The counts straddle the page end: Steps follows other lines on page 2,
    // then opens page 3.
    expect(
      drawn.map(({ pages }) => pages.findIndex((page) => lines(page).includes("Steps"))),
    ).toEqual([1, 2, 2]);
    expect(drawn.map(({ pages }) => lines(pages[2] ?? pages[0]!)[0])).toEqual([
      expect.anything(),
      "Steps",
      "Steps",
    ]);
  }),
);

it.effect("keeps the total and yield row whole on one page", () =>
  Effect.gen(function* () {
    // These titles end within a stat row's height of the first page's end.
    const photo = photoOf(yield* image(() => scene(600, 400).jpeg().toBuffer()), "image/jpeg");
    const titled = yield* Effect.forEach([72, 73, 74, 75, 76, 77], (words) =>
      render(
        { ...recipe, title: Array.from({ length: words }, (_, index) => `word${index}`).join(" ") },
        photo,
      ),
    );
    // A yield too tall for any page runs across pages instead, all of it drawn.
    const tall = yield* render({
      ...recipe,
      yield: {
        quantity: { kind: "exact", value: { numerator: 4, denominator: 1 } },
        label: "servings ".repeat(600).trim(),
      },
    });

    for (const { pages } of titled) {
      const page = pages.map(lines).find((text) => text.includes("Total | Makes"));
      expect(page?.[(page?.indexOf("Total | Makes") ?? 0) - 1]).toBe("1 hr 10 min | 4–6 servings");
    }
    const text = tall.pages.flatMap(lines);
    expect(text.join(" ").match(/servings/g)).toHaveLength(600);
    expect(text.slice(0, 3)).toEqual(["Crème Fraîche Lemon Orzo", "1 hr 10 min", "Total"]);
    expect(text.indexOf("Makes")).toBeLessThan(text.indexOf("Ingredients"));
    expect(tall.pages.every((page) => page.width === 612 && page.height === 792)).toBe(true);
  }),
);

// Horizontal bands from top to bottom: black, red, white, blue, black. A
// centred crop to the banner's 7:3 shape keeps red at its top, white in its
// middle and blue at its bottom, and loses both black bands. Without `fill`,
// the middle band is transparent.
const banded = (width: number, height: number, fill = true) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="10%" fill="#000"/>
      <rect y="10%" width="100%" height="30%" fill="#f00"/>
      ${fill ? '<rect y="40%" width="100%" height="20%" fill="#fff"/>' : ""}
      <rect y="60%" width="100%" height="30%" fill="#00f"/>
      <rect y="90%" width="100%" height="10%" fill="#000"/></svg>`,
    ),
  );

// Vertical bands from left to right: black, green, black.
const panorama = (width: number, height: number) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="#000"/>
      <rect x="15%" width="70%" height="100%" fill="#0f0"/></svg>`,
    ),
  );

// The photo PDFKit embedded unchanged, from the PDF's one DCTDecode stream.
const embeddedJpeg = (bytes: Uint8Array) => {
  const pdf = Buffer.from(bytes);
  const filter = pdf.indexOf("/DCTDecode");
  const dictionary = pdf.subarray(pdf.lastIndexOf("<<", filter), pdf.indexOf(">>", filter));
  const length = Number(/\/Length (\d+)/.exec(dictionary.toString("latin1"))?.[1]);
  const start = pdf.indexOf("stream\n", filter) + "stream\n".length;
  return pdf.subarray(start, start + length);
};

const colourName = ([r = 0, g = 0, b = 0]: ReadonlyArray<number>) =>
  r > 200 && g > 200 && b > 200
    ? "white"
    : r > 200 && g < 80 && b < 80
      ? "red"
      : r < 80 && g > 200 && b < 80
        ? "green"
        : r < 80 && g < 80 && b > 200
          ? "blue"
          : r < 60 && g < 60 && b < 60
            ? "black"
            : `rgb(${r}, ${g}, ${b})`;

// Colours at the banner's top centre, centre, bottom centre, left middle and right middle.
const bannerColours = (jpeg: Uint8Array) =>
  Effect.tryPromise(async () => {
    const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const offset = (Math.round(y) * info.width + Math.round(x)) * info.channels;
      return colourName([...data.subarray(offset, offset + 3)]);
    };
    const [right, bottom] = [info.width - 3, info.height - 3];
    return [
      at(info.width / 2, 2),
      at(info.width / 2, info.height / 2),
      at(info.width / 2, bottom),
      at(2, info.height / 2),
      at(right, info.height / 2),
    ];
  });

it.effect("draws photos as a centre-cropped banner the content width", () =>
  Effect.gen(function* () {
    const jpeg = yield* image(() => banded(2400, 1600).jpeg().toBuffer());
    const png = yield* image(() => banded(800, 1200, false).png().toBuffer());
    const webp = yield* image(() => banded(2400, 1600).webp().toBuffer());
    // Stored sideways, with EXIF saying to turn it a quarter clockwise.
    const sideways = yield* image(() =>
      banded(1200, 1600).rotate(270).jpeg().withMetadata({ orientation: 6 }).toBuffer(),
    );
    const wide = yield* image(() => panorama(4000, 500).jpeg().toBuffer());
    const small = yield* image(() => banded(300, 200).png().toBuffer());
    const original = sideways.slice();

    const drawn = yield* Effect.forEach(
      [
        photoOf(jpeg, "image/jpeg"),
        photoOf(png, "image/png"),
        photoOf(webp, "image/webp"),
        photoOf(sideways, "image/jpeg"),
        photoOf(wide, "image/jpeg"),
        photoOf(small, "image/png"),
      ],
      (photo) => render(recipe, photo),
    );

    // At most 1260 × 540 px; smaller photos keep their own resolution.
    expect(
      drawn.map(({ pages }) => pages[0]?.images.map(({ width, height }) => [width, height])),
    ).toEqual([
      [[1260, 540]],
      [[800, 343]],
      [[1260, 540]],
      [[1200, 514]],
      [[1167, 500]],
      [[300, 129]],
    ]);
    // Each fills the 504 × 216 pt banner from the left margin.
    for (const { pages } of drawn) {
      expect(pages[0]?.images[0]?.drawn).toEqual([54, 504, 216]);
    }
    const colours = yield* Effect.forEach(drawn, ({ bytes }) => bannerColours(embeddedJpeg(bytes)));
    expect(colours).toEqual([
      ["red", "white", "blue", "white", "white"],
      // The transparent band is flattened onto white.
      ["red", "white", "blue", "white", "white"],
      ["red", "white", "blue", "white", "white"],
      // Turned upright before cropping.
      ["red", "white", "blue", "white", "white"],
      // Cropped from the middle of a wide photo too.
      ["green", "green", "green", "green", "green"],
      ["red", "white", "blue", "white", "white"],
    ]);
    expect(drawn.flatMap(({ warnings }) => warnings)).toEqual([]);
    expect(drawn.flatMap(({ pages }) => pages.slice(1).flatMap((page) => page.images))).toEqual([]);
    // The photo sits above the title on the first page.
    expect(lines(drawn[0]?.pages[0] ?? { width: 0, height: 0, items: [], images: [] })[0]).toBe(
      recipe.title,
    );
    expect(Buffer.compare(sideways, original)).toBe(0);
  }),
);

it.effect("draws one PDF at a time, while later renders wait their turn", () =>
  Effect.gen(function* () {
    // Counts renders in flight by their span, which covers the drawing only.
    let drawing = 0;
    let most = 0;
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options);
        if (options.name !== "@goho/RecipePdf.render") return span;
        most = Math.max(most, ++drawing);
        const end = span.end.bind(span);
        span.end = (endTime, exit) => {
          drawing--;
          end(endTime, exit);
        };
        return span;
      },
    });
    const pdf = yield* RecipePdf.Service;
    // Sharp and PDFKit yield to the event loop, so unguarded renders overlap.
    const photo = photoOf(yield* image(() => scene().jpeg().toBuffer()), "image/jpeg");
    const pdfs = yield* Effect.all(
      Array.from({ length: 3 }, () => pdf.render(recipe, photo)),
      { concurrency: "unbounded" },
    ).pipe(Effect.withTracer(tracer));
    expect(pdfs).toHaveLength(3);
    expect([most, drawing]).toEqual([1, 0]);
  }).pipe(Effect.provide(RecipePdf.layer.pipe(Layer.provide(NodeServices.layer)))),
);

// Live, as Sharp's work runs on its own threads in real time.
it.live("finishes an interrupted render before the next one starts", () =>
  Effect.gen(function* () {
    const pdf = yield* RecipePdf.Service;
    // A large photo of noise keeps Sharp decoding long after the interruption.
    const noise = randomFillSync(new Uint8Array(4000 * 3000 * 3));
    const photo = photoOf(
      yield* image(() =>
        sharp(noise, { raw: { width: 4000, height: 3000, channels: 3 } })
          .jpeg()
          .toBuffer(),
      ),
      "image/jpeg",
    );
    // Sharp images being decoded or encoded on its threads. Its queued count
    // moves to this one in two steps, so the two can't be summed reliably.
    const processing = () => sharp.counters().process;
    while (processing() > 0) yield* Effect.sleep("1 millis");
    let most = 0;
    const sampler = yield* Effect.forkScoped(
      Effect.forever(
        Effect.sync(() => {
          most = Math.max(most, processing());
        }).pipe(Effect.andThen(Effect.sleep("1 millis"))),
      ),
    );

    const first = yield* Effect.forkScoped(pdf.render(recipe, photo));
    // Interrupt while Sharp is decoding the first photo.
    while (processing() === 0) yield* Effect.sleep("1 millis");
    yield* Fiber.interrupt(first);
    yield* pdf.render(recipe, photo);
    yield* Fiber.interrupt(sampler);
    expect(most).toBe(1);
  }).pipe(Effect.provide(RecipePdf.layer.pipe(Layer.provide(NodeServices.layer)))),
);

it.effect("draws the recipe without a photo that can't be used, and logs why", () =>
  Effect.gen(function* () {
    const withoutPhoto = yield* render(recipe);
    // 225 megapixels in an otherwise tiny PNG's header: over the 100-megapixel
    // limit, though under Sharp's own 268.
    const huge = yield* image(() => scene(1, 1).png().toBuffer());
    huge.writeUInt32BE(15_000, 16);
    huge.writeUInt32BE(15_000, 20);
    huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29);
    const cases = [
      photoOf(new TextEncoder().encode("not an image"), "image/jpeg"),
      photoOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), "image/jpeg"),
      photoOf(huge, "image/png"),
    ];

    const drawn = yield* Effect.forEach(cases, (photo) => render(recipe, photo));

    expect(withoutPhoto.pages.flatMap((page) => page.images)).toEqual([]);
    for (const { pages, warnings } of drawn) {
      expect(pages.flatMap((page) => page.images)).toEqual([]);
      expect(pages.map(lines)).toEqual(withoutPhoto.pages.map(lines));
      expect(warnings).toHaveLength(1);
    }
    expect(drawn.map(({ warnings }) => warnings[0])).toEqual([
      ["Recipe PDF photo skipped: not a JPEG, PNG or WebP image"],
      [expect.stringContaining("Recipe PDF photo skipped"), expect.anything()],
      [
        "Recipe PDF photo skipped",
        expect.objectContaining({
          cause: expect.objectContaining({
            message: expect.stringContaining("exceeds pixel limit"),
          }),
        }),
      ],
    ]);
  }),
);

it.effect("draws invisible formatting and space and hyphen variants as Geist can", () =>
  Effect.gen(function* () {
    const input: Recipe = {
      ...recipe,
      title: "\uFEFFRoast at 180\u2009°C",
      ingredients: [
        {
          id: "butter",
          name: "non\u2010stick table\u200Bspoon of but\u00ADter\uFE0F",
          quantity: { kind: "exact", value: { numerator: 1, denominator: 1 } },
          unit: "cup",
        },
      ],
      steps: [
        {
          segments: [
            { kind: "text", text: "Rest 20\u202Fmin, co\u2011op\u2002style.  Then add " },
            {
              kind: "mark",
              content: {
                kind: "ingredient",
                ingredientId: "butter",
                portion: { numerator: 1, denominator: 1 },
              },
            },
            { kind: "text", text: ".\nServe\u2003warm\u2007\u200D." },
          ],
        },
      ],
    };
    const original = structuredClone(input);

    const { pages, warnings } = yield* render(input);

    expect(pages.flatMap(lines)).toEqual([
      "Roast at 180 °C",
      "1 hr 10 min | 4–6 servings",
      "Total | Makes",
      "Ingredients",
      "1 cup non-stick tablespoon of butter",
      "Steps",
      // pdf.js reads the double space as one; the width below shows both.
      "1 Rest 20 min, co-op style. Then add 1 cup non-stick tablespoon of butter.",
      "Serve warm .",
      "Goho",
    ]);
    const spaced = pages[0]?.items.find((item) => item.text.startsWith("Rest"));
    expect(spaced?.width).toBeCloseTo(
      yield* geistWidth("Rest 20 min, co-op style.  Then add", 11),
      2,
    );
    expect(warnings).toEqual([]);
    expect(input).toEqual(original);
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("draws characters the font lacks as its missing glyph and logs them", () =>
  Effect.gen(function* () {
    const { pages, warnings } = yield* render({ ...recipe, title: "Lemon 🍋 Orzo 中" });

    // The missing glyph is Geist's visible crossed box, which reads back as U+0000.
    expect(lines(pages[0] ?? { width: 0, height: 0, items: [], images: [] })[0]).toBe(
      "Lemon \u0000 Orzo \u0000",
    );
    expect(warnings).toEqual([
      ["Recipe PDF has characters its font lacks", { codePoints: ["U+1F34B", "U+4E2D"] }],
    ]);
  }),
);
