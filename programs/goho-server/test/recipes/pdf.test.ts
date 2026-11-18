import { randomFillSync } from "node:crypto";

import { NodeServices } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { type Recipe, RecipeUrl } from "@goho/goho-api/recipes";
import { Effect, Fiber, Layer, Logger, Option, Tracer } from "effect";
// pdf.js ships a legacy build for runtimes without its newest JavaScript
// features; Node 26 lacks Math.sumPrecise, which the default build uses.
// oxlint-disable-next-line nopeus/no-cross-package-internals
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import { expect } from "vitest";

import type { Photo } from "#src/recipes/model.ts";
import * as RecipePdf from "#src/recipes/pdf.ts";
import { longRecipe, recipe, sectionedRecipe } from "#test/recipes/pdf-fixtures.ts";

interface Item {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

interface Page {
  readonly items: ReadonlyArray<Item>;
  /** Each drawn image's pixel size, and its drawn width and height in points. */
  readonly images: ReadonlyArray<readonly [width: number, height: number, drawn: [number, number]]>;
  readonly links: ReadonlyArray<string>;
  /** Fill colours in drawing order, as lowercase hex. */
  readonly fills: ReadonlyArray<string>;
}

// Wider than a step number's gap to its text, narrower than any column gap.
const joinGap = 16;

// Reads the PDF with pdf.js, an independent parser, rather than trusting PDFKit.
const parse = (bytes: Uint8Array) =>
  Effect.tryPromise(async () => {
    const task = getDocument({ data: new Uint8Array(bytes) });
    const document = await task.promise;
    const pages: Array<Page> = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const operators = await page.getOperatorList();
      const annotations: Array<{ subtype: string; url?: string }> = await page.getAnnotations();
      pages.push({
        items: content.items.flatMap((item) =>
          // pdf.js also fills a gap between strings on one line with a space
          // item; one wider than `lines` joins across is a gap, not a space.
          "str" in item && item.str !== "" && (item.str.trim() !== "" || item.width <= joinGap)
            ? [
                {
                  text: item.str,
                  x: Number(item.transform[4]),
                  y: Number(item.transform[5]),
                  width: item.width,
                },
              ]
            : [],
        ),
        images: operators.fnArray.flatMap((operator, index) => {
          if (operator !== OPS.paintImageXObject) return [];
          const [, width, height] = operators.argsArray[index] ?? [];
          // PDFKit places an image with one transform just before drawing it.
          const placement = operators.fnArray.lastIndexOf(OPS.transform, index);
          const [a = 0, , , d = 0] = (operators.argsArray[placement] ?? []).map(Number);
          return [[Number(width), Number(height), [a, Math.abs(d)]] as const];
        }),
        links: annotations.flatMap(({ subtype, url }) =>
          subtype === "Link" && url !== undefined ? [url] : [],
        ),
        fills: operators.fnArray.flatMap((operator, index) =>
          operator === OPS.setFillRGBColor ? [String(operators.argsArray[index]?.[0])] : [],
        ),
      });
    }
    await task.destroy();
    return pages;
  });

// Text lines from top to bottom, taking baselines within 2pt as one line, such
// as a step number and its text. Pieces further apart than a step number from
// its text, such as columns, stats or the footer, are joined with “ | ”.
const lines = (items: ReadonlyArray<Item>) => {
  const rows: Array<{ y: number; items: Array<Item> }> = [];
  for (const item of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.at(-1);
    if (row !== undefined && row.y - item.y <= 2) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.map(({ items }) =>
    [...items]
      .sort((a, b) => a.x - b.x)
      .reduce<{ text: string; end: number | null }>(
        (line, item) => ({
          text:
            line.text + (line.end !== null && item.x - line.end > joinGap ? " | " : "") + item.text,
          end: item.x + item.width,
        }),
        { text: "", end: null },
      )
      .text.trim(),
  );
};

// The ingredients column ends left of this line; the steps column starts right of it.
const gutter = 54 + 168 + 12;

// One column's items below the headings and above the footer.
const columnItems = (page: Page, side: "ingredients" | "steps") => {
  const headings = page.items.find((item) => item.text === "Steps")?.y ?? Infinity;
  return page.items.filter(
    (item) =>
      item.y <= headings + 0.01 && item.y > 40 && item.x < gutter === (side === "ingredients"),
  );
};

const column = (page: Page, side: "ingredients" | "steps") => lines(columnItems(page, side));

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
    return { warnings, pages: yield* parse(bytes) };
  }).pipe(Effect.provide(RecipePdf.layer.pipe(Layer.provide(NodeServices.layer))));

const photoOf = (bytes: Uint8Array, contentType: Photo["contentType"]) =>
  Option.some({ bytes, contentType });

// A landscape scene, 3:2 unless told otherwise.
const scene = (width = 2400, height = 1600) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 120, b: 60, alpha: 0.5 } },
  });

const image = (build: () => Promise<Buffer>) => Effect.tryPromise(build);

// Expected wording follows the Android app's RecipeText.kt and its en strings,
// with en-CA number formats.
it.effect("words amounts, marks, total time and yield as the app does", () =>
  Effect.gen(function* () {
    const { pages, warnings } = yield* render({ ...recipe, source: null });
    const [page = { items: [], images: [], links: [], fills: [] }] = pages;

    expect(warnings).toEqual([]);
    expect(lines(page.items).slice(0, 3)).toEqual([
      "Crème Fraîche Lemon Orzo",
      "1 hr 10 min | 4–6 servings",
      "Total | Makes",
    ]);
    // Joined, so the checks read the wording rather than where lines wrap.
    expect(column(page, "ingredients").join(" ")).toBe(
      [
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
      ].join(" "),
    );
    // Marks scale numbers by their portion before rounding; a partial amount in
    // words leads with the fraction.
    expect(column(page, "steps").join(" ")).toBe(
      [
        "Steps",
        "1 Heat the oven to 350°F (175°C). Bring 1¼ cups chicken stock to a simmer.",
        "2 Melt 1–2 tbsp unsalted butter, cubed, then stir in 453.59 g orzo and ½ of salt (to taste).",
        "3 Whisk 3 eggs with ½–1 cup milk, 1 cup crème fraîche and a good squeeze of lemon.",
        "Season with salt (to taste).",
      ].join(" "),
    );
  }),
);

it.effect("runs a long recipe over numbered pages, ingredients beside the steps", () =>
  Effect.gen(function* () {
    const { pages } = yield* render(longRecipe);
    const ingredients = pages.map((page) => column(page, "ingredients"));
    const steps = pages.map((page) => column(page, "steps"));

    expect(pages.length).toBeGreaterThanOrEqual(3);
    // Every page ends with its number.
    expect(pages.map((page) => lines(page.items).at(-1))).toEqual(
      pages.map((_, index) => `Goho | Page ${index + 1} of ${pages.length}`),
    );
    // Ingredient text stays left of the gutter, clear of the steps; the source
    // below both runs the full width.
    for (const page of pages) {
      for (const item of columnItems(page, "ingredients")) {
        if (item.text !== longRecipe.source?.url)
          expect(item.x + item.width, item.text).toBeLessThan(gutter);
      }
    }
    // Each list is drawn whole and in order, the ingredients continuing on the
    // next page beside the steps.
    expect(ingredients.flat().flatMap((line) => /ingredient (\d+)/.exec(line)?.[1] ?? [])).toEqual(
      longRecipe.ingredients.map((_, index) => `${index + 1}`),
    );
    expect(
      steps.flat().flatMap((line) => /^(\d+) (?:Step \1:|Line one)/.exec(line)?.[1] ?? []),
    ).toEqual(longRecipe.sections[0].steps.map((_, index) => `${index + 1}`));
    expect(ingredients[1]?.[0]).toMatch(/ingredient \d+$/);
    expect(steps[1]?.length).toBeGreaterThan(0);
  }),
);

it.effect("titles each of several sections and numbers its steps from 1", () =>
  Effect.gen(function* () {
    const { pages, warnings } = yield* render(sectionedRecipe);
    const steps = pages.map((page) => column(page, "steps"));
    const titles = sectionedRecipe.sections.map(({ title }) => title);

    expect(warnings).toEqual([]);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    // Each title leads its own steps, numbered again from 1, with marks from
    // the one ingredient list.
    const lines = steps.flat();
    expect(lines.filter((line) => titles.includes(line))).toEqual(titles);
    expect(
      lines.flatMap((line) =>
        titles.includes(line) ? [line] : (/^(\d+) (?:Beat|Step \1:)/.exec(line)?.[1] ?? []),
      ),
    ).toEqual(titles.flatMap((title) => [title, "1", "2", "3", "4", "5"]));
    expect(lines).toContain("1 Beat ⅛ cup sugar for section 2.");
    // A title never ends a page: it stays with its first step.
    for (const page of steps) expect(titles).not.toContain(page.at(-1));
  }),
);

it.effect("leaves a lone section untitled, drawing it as before", () =>
  Effect.gen(function* () {
    const [{ steps }] = recipe.sections;
    const untitled = yield* render(recipe);
    const titled = yield* render({ ...recipe, sections: [{ title: "Orzo", steps }] });
    expect(titled.pages.map((page) => page.items)).toEqual(
      untitled.pages.map((page) => page.items),
    );
  }),
);

it.effect("signs every page with the family beside the Goho mark, clear of the text", () =>
  Effect.gen(function* () {
    const family = ["#6964ba", "#d65b63", "#eabb35"];
    for (const input of [recipe, longRecipe]) {
      const { pages } = yield* render(input);
      for (const page of pages) {
        // Bram, Mira and their child, once each and in that order, as vectors.
        expect(page.fills.filter((fill) => family.includes(fill))).toEqual(family);
        expect(page.images).toEqual([]);
        // The 23 × 16 pt family sits at the left margin; the mark follows it on
        // the footer's baseline, and nothing else is drawn beside it.
        const footer = page.items.filter((item) => item.y < 54);
        expect(footer[0]).toMatchObject({ text: "Goho", y: 36 });
        expect(footer[0]?.x).toBeCloseTo(54 + (16 / 45.4) * 65.2 + 4, 1);
        expect(page.items.filter((item) => item.x < 78 && item.y < 66)).toEqual([]);
        // Page numbers stay against the right margin.
        for (const item of footer.slice(1)) expect(item.x + item.width).toBeCloseTo(558, 0);
      }
    }
  }),
);

it.effect("ends with the source as a link to its ASCII URL, or no link without one", () =>
  Effect.gen(function* () {
    const url = "https://exämple.com/crème brûlée/(x)?q=日本";
    const sourced = yield* render(recipe);
    const nonAscii = yield* render({
      ...recipe,
      source: { kind: "url", url: RecipeUrl.make(url) },
    });
    const unsourced = yield* render({ ...recipe, source: null });

    const source = recipe.source?.url;
    expect(sourced.pages.flatMap((page) => page.links)).toEqual([source]);
    expect(lines(sourced.pages.at(-1)?.items ?? []).at(-2)).toBe(source);
    // PDFKit would write a non-ASCII URI as UTF-16, which viewers can't open.
    expect(nonAscii.pages.flatMap((page) => page.links)).toEqual([
      "https://xn--exmple-cua.com/cr%C3%A8me%20br%C3%BBl%C3%A9e/(x)?q=%E6%97%A5%E6%9C%AC",
    ]);
    expect(unsourced.pages.flatMap((page) => page.links)).toEqual([]);
    expect(unsourced.pages.flatMap((page) => lines(page.items)).join("\n")).not.toMatch(/http/);
  }),
);

it.effect("draws a usable photo as the banner, and skips one that can't be used", () =>
  Effect.gen(function* () {
    const jpeg = yield* Effect.tryPromise(() =>
      sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#c8783c" } })
        .jpeg()
        .toBuffer(),
    );
    const withPhoto = yield* render(
      recipe,
      Option.some({ bytes: jpeg, contentType: "image/jpeg" }),
    );
    const withoutPhoto = yield* render(recipe);
    const unusable = yield* render(
      recipe,
      Option.some({ bytes: new TextEncoder().encode("not an image"), contentType: "image/jpeg" }),
    );

    // Cropped to 1260 × 360 px and drawn 504 × 144 pt.
    expect(withPhoto.pages.map((page) => page.images)).toEqual([[[1260, 360, [504, 144]]]]);
    expect(lines(withPhoto.pages[0]?.items ?? [])[0]).toBe(recipe.title);
    expect(withPhoto.warnings).toEqual([]);
    expect(unusable.pages.flatMap((page) => page.images)).toEqual([]);
    expect(unusable.pages.map((page) => lines(page.items))).toEqual(
      withoutPhoto.pages.map((page) => lines(page.items)),
    );
    expect(unusable.warnings).toEqual([
      ["Recipe PDF photo skipped: not a JPEG, PNG or WebP image"],
    ]);
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
