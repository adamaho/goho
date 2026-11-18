import type {
  Fraction,
  Ingredient,
  Quantity,
  Recipe,
  RecipeUnit,
  RecipeYield,
  Step,
} from "@goho/goho-api/recipes";
import { Context, Effect, FileSystem, Layer, Option, Path, Semaphore } from "effect";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import sharp from "sharp";

import { PdfError, type Photo, sniffPhotoContentType } from "./model.ts";

/**
 * Recipe PDF rendering.
 *
 * @category models
 * @since 0.1.0
 */
export interface Interface {
  /**
   * Draws the recipe on US Letter pages for printing or sharing: its photo
   * when given, as a banner the content width that crops the photo from its
   * centre, then its title, total time and yield when known, and two columns:
   * ingredients in a narrow one beside numbered steps with their ingredient
   * marks, worded as the app shows them. A recipe with several sections titles
   * each one's steps and numbers them from 1; a lone section's title is never
   * shown. The source URL, when there is one,
   * ends the last page as a link. A photo that isn't a readable JPEG, PNG or WebP
   * image within the decoding limit is logged and left out. Invisible
   * formatting, such as soft hyphens and zero-width spaces, is dropped, and
   * thin and other narrow spaces and Unicode hyphens are drawn as plain ones;
   * any other character the font lacks is drawn as its missing glyph and
   * logged. The recipe and photo are not changed. Renders run one at a time
   * per layer; a call waits for the ones before it, and once started it
   * finishes even if interrupted.
   */
  readonly render: (
    recipe: Recipe,
    photo: Option.Option<Photo>,
  ) => Effect.Effect<Uint8Array, PdfError>;
}

/**
 * Draws recipes as PDFs in memory, without storing anything.
 *
 * @category services
 * @since 0.1.0
 */
export class Service extends Context.Service<Service, Interface>()("@goho/goho-server/RecipePdf") {}

// Recipe wording as the Android app shows it, following its RecipeText.kt and
// en strings, with the app's number formats fixed to en-CA.

// One ingredient line: `amount` is set in bold before `name` when the recipe
// gives a number. An amount in words follows the name, as in “salt (to taste)”.
interface IngredientLine {
  readonly amount: string | null;
  readonly name: string;
}

// Step wording in reading order; marks are drawn in bold.
interface StepPart {
  readonly kind: "plain" | "mark";
  readonly text: string;
}

interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

const reduced = (numerator: bigint, denominator: bigint): Rational => {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
};

const rational = (fraction: Fraction) =>
  reduced(BigInt(fraction.numerator), BigInt(fraction.denominator));

const times = (a: Rational, b: Rational) =>
  reduced(a.numerator * b.numerator, a.denominator * b.denominator);

const one: Rational = { numerator: 1n, denominator: 1n };

const isOne = (value: Rational) => value.numerator === 1n && value.denominator === 1n;

// Halves, thirds, quarters and eighths: the familiar cooking fractions with a
// glyph in Geist. Fifths have only ⅕, so all fifths use decimals.
const vulgarFractions: ReadonlyMap<string, string> = new Map([
  ["1/2", "½"],
  ["1/3", "⅓"],
  ["2/3", "⅔"],
  ["1/4", "¼"],
  ["3/4", "¾"],
  ["1/8", "⅛"],
  ["3/8", "⅜"],
  ["5/8", "⅝"],
  ["7/8", "⅞"],
]);

const integer = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });

interface Amount {
  readonly text: string;
  readonly plural: boolean;
}

// Whole numbers and familiar fractions are exact (“2½”); anything else is a
// decimal rounded half up to at most two places. A positive value that rounds
// to zero reads “<0.01”. `plural` follows the shown value.
const formatAmount = (value: Rational, fractions: boolean): Amount => {
  if (fractions) {
    const whole = value.numerator / value.denominator;
    const remainder = value.numerator % value.denominator;
    const plural = value.numerator > value.denominator;
    if (remainder === 0n) return { text: integer.format(whole), plural };
    const glyph = vulgarFractions.get(`${remainder}/${value.denominator}`);
    if (glyph !== undefined) {
      return { text: whole === 0n ? glyph : integer.format(whole) + glyph, plural };
    }
  }
  // Hundredths, rounded half up: floor((200n + d) / 2d).
  const hundredths = (value.numerator * 200n + value.denominator) / (value.denominator * 2n);
  if (hundredths === 0n) return { text: "<0.01", plural: false };
  const cents = (hundredths % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  const text = integer.format(hundredths / 100n) + (cents === "" ? "" : `.${cents}`);
  return { text, plural: hundredths > 100n };
};

interface UnitLabel {
  readonly one: string;
  readonly other: string;
  readonly fractions: boolean;
}

const label = (one: string, other: string, fractions: boolean): UnitLabel => ({
  one,
  other,
  fractions,
});

// Fractions read naturally for spoons, cups and counted units; metric units
// use decimals. Counts have no label.
const unitLabels = {
  millilitre: label("mL", "mL", false),
  litre: label("L", "L", false),
  gram: label("g", "g", false),
  kilogram: label("kg", "kg", false),
  tablespoon: label("tbsp", "tbsp", true),
  teaspoon: label("tsp", "tsp", true),
  cup: label("cup", "cups", true),
  clove: label("clove", "cloves", true),
  can: label("can", "cans", true),
  bunch: label("bunch", "bunches", true),
  pinch: label("pinch", "pinches", true),
  dash: label("dash", "dashes", true),
  handful: label("handful", "handfuls", true),
  knob: label("knob", "knobs", true),
  count: null,
} satisfies Record<RecipeUnit, UnitLabel | null>;

const formatQuantity = (
  quantity: Exclude<Quantity, { readonly kind: "text" }>,
  portion: Rational,
  fractions: boolean,
): Amount => {
  if (quantity.kind === "exact")
    return formatAmount(times(rational(quantity.value), portion), fractions);
  // Both ends are scaled before formatting; ends that round alike show once.
  const low = formatAmount(times(rational(quantity.min), portion), fractions);
  const high = formatAmount(times(rational(quantity.max), portion), fractions);
  return low.text === high.text ? high : { text: `${low.text}–${high.text}`, plural: high.plural };
};

// A numeric quantity times `portion` with its unit.
const amountText = (
  quantity: Exclude<Quantity, { readonly kind: "text" }>,
  unit: RecipeUnit | null,
  portion: Rational,
) => {
  const unitLabel = unit === null ? null : unitLabels[unit];
  const amount = formatQuantity(quantity, portion, unitLabel?.fractions ?? true);
  if (unitLabel === null) return amount.text;
  return `${amount.text} ${amount.plural ? unitLabel.other : unitLabel.one}`;
};

const textAmount = (name: string, text: string) => `${name} (${text})`;

// The ingredient as the app lists it: “2½ cups” and “chicken stock”, or
// “salt (to taste)” with no amount.
const ingredientLine = (ingredient: Ingredient): IngredientLine =>
  ingredient.quantity.kind === "text"
    ? { amount: null, name: textAmount(ingredient.name, ingredient.quantity.text) }
    : { amount: amountText(ingredient.quantity, ingredient.unit, one), name: ingredient.name };

const markText = (ingredient: Ingredient, portion: Fraction) => {
  const share = rational(portion);
  if (ingredient.quantity.kind === "text") {
    const whole = textAmount(ingredient.name, ingredient.quantity.text);
    return isOne(share) ? whole : `${formatAmount(share, true).text} of ${whole}`;
  }
  return `${amountText(ingredient.quantity, ingredient.unit, share)} ${ingredient.name}`;
};

// Text segments and text marks keep their wording exactly. An ingredient mark
// reads as its ingredient's line, with numeric amounts scaled by the step's
// portion before rounding; for an amount in words, a partial portion leads
// with the fraction, “½ of salt (to taste)”. A mark whose ingredient is
// missing is left out, as the app does.
const stepParts = (
  step: Step,
  ingredients: ReadonlyMap<string, Ingredient>,
): ReadonlyArray<StepPart> =>
  step.segments.flatMap((segment): ReadonlyArray<StepPart> => {
    if (segment.kind === "text") return [{ kind: "plain", text: segment.text }];
    const content = segment.content;
    if (content.kind === "text") return [{ kind: "mark", text: content.text }];
    const ingredient = ingredients.get(content.ingredientId);
    return ingredient === undefined
      ? []
      : [{ kind: "mark", text: markText(ingredient, content.portion) }];
  });

// “25 min”, “1 hr 10 min” or “2 hr”, rounded half up to the nearest minute;
// zero is “0 min” and 1–59 seconds is “<1 min”.
const recipeDuration = (seconds: number): string => {
  if (seconds >= 1 && seconds <= 59) return "<1 min";
  const minutes = Math.floor((seconds + 30) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${integer.format(rest)} min`;
  if (rest === 0) return `${integer.format(hours)} hr`;
  return `${integer.format(hours)} hr ${integer.format(rest)} min`;
};

// What the recipe makes, which the app doesn't show: “4 servings” or
// “4–6 servings”, with counted-unit fractions, or the source's wording after
// the label in brackets, as amounts in words read, “cookies (about 2 dozen)”.
const recipeYield = (made: RecipeYield): string =>
  made.quantity.kind === "text"
    ? textAmount(made.label, made.quantity.text)
    : `${formatQuantity(made.quantity, one, true).text} ${made.label}`;

// US Letter in points, with ¾-inch side and top margins.
const page = { width: 612, height: 792 } as const;
const margin = 54;
const contentWidth = page.width - margin * 2;
const contentBottom = page.height - 66;
const footerBaseline = page.height - 36;

// Goho's light palette, which prints on white; the outline is a little darker
// than the app's so it survives printing.
const colors = {
  text: "#26233A",
  tertiary: "#6E6A83",
  outline: "#E3E2E9",
  accent: "#8B91D6",
  brand: "#5059A6",
  accentContainer: "#E9E9FB",
  onAccentContainer: "#444AA0",
} as const;

type FontName = "regular" | "semibold";

interface TextStyle {
  readonly font: FontName;
  readonly size: number;
  readonly color: string;
  readonly tracking?: number;
}

const styles = {
  title: { font: "semibold", size: 24, color: colors.text, tracking: -0.6 },
  statValue: { font: "semibold", size: 11, color: colors.text },
  statLabel: { font: "regular", size: 8.5, color: colors.tertiary },
  section: { font: "semibold", size: 14, color: colors.text, tracking: -0.25 },
  // A titled part of the steps, such as the frosting.
  subsection: { font: "semibold", size: 12, color: colors.text, tracking: -0.15 },
  body: { font: "regular", size: 11, color: colors.text },
  // Ingredient amounts, and step marks, which read like them.
  amount: { font: "semibold", size: 11, color: colors.text },
  stepNumber: { font: "semibold", size: 8, color: colors.onAccentContainer },
  footer: { font: "regular", size: 8, color: colors.tertiary },
  brand: { font: "semibold", size: 8, color: colors.brand },
  source: { font: "regular", size: 8.5, color: colors.tertiary },
} as const satisfies Record<string, TextStyle>;

const lineHeights = {
  title: 28,
  stat: 14,
  statLabel: 11,
  section: 18,
  subsection: 17,
  body: 17,
  source: 12,
} as const;

// Ingredients take a third of the content width, beside the steps.
const listColumns = {
  ingredients: { x: margin, width: 168 },
  steps: { x: margin + 168 + 24, width: contentWidth - 168 - 24 },
} as const;

// The photo is a 2-inch banner across the content width, cropped to fill it.
const photoBox = { width: contentWidth, height: 144, radius: 10 } as const;
// The banner at 180 dpi, enough for a sharp print.
const photoPixels = { width: 1260, height: 360 } as const;
// Twice a 50-megapixel phone photo, below Sharp's default of 268 megapixels.
// An interlaced PNG, which Sharp can't decode in strips, takes about 400 MB at
// this size.
const maxPhotoPixels = 100_000_000;

// The family from Goho's launcher icon (the design skill's
// family-foreground.svg), without its ivory background: Bram, Mira and their
// child as flat silhouettes in the launcher's own colours and 108-unit space,
// each later one parted from those behind it by a thin gap. The SVG scales the
// whole group, gaps included, by 0.97; the bounds size the icon here instead.
const family = {
  members: [
    {
      color: "#6964BA",
      path: "M28.1 42.8C26.7 40.8 27 35.6 28.6 35.6C30.3 35.6 32.4 37.2 33.7 38.5C39 36.2 47.1 36.2 51.2 38.2C52.7 36.8 54.8 35.4 56.1 35.8C57.5 36.2 57.6 40.9 56.5 42.5C60.9 46.5 64.1 53.3 64.4 59.8C64.8 65.7 62.5 69 58.4 69.2C58.7 72.9 56.3 74.6 52.3 74.6C48.9 74.6 47 73.6 46.7 71.2C43.4 71.6 39.8 71.5 36.7 71.2C36.5 73.7 34.1 74.7 30.4 74.4C27.2 74.2 25.7 72.7 26.1 69.6C21.4 68.2 21.5 62.7 22.9 56.7C24.1 51.3 25.8 46.4 28.1 42.8Z",
    },
    {
      color: "#D65B63",
      path: "M55.4 47.1C58.4 41.1 63 37.4 69.4 36.8C72.2 34.6 75.8 34.4 77.4 36.3C79.4 38.5 78.6 41.1 76.8 41.1C82.1 45.2 85 51.3 85.7 57.7C86.6 64.3 84.8 68.4 81.4 69.4C82 72.6 80.4 74.6 76.7 74.7C73.3 74.8 70.9 73.6 70.7 71.6C67.5 72 64 72 61.1 71.5C60.4 73.8 58.2 74.8 54.7 74.4C51.5 74.1 50.2 72.5 50.8 69.5C47.8 67.5 47.3 63.4 48.5 58.4C49.9 53.3 52.1 49.6 55.4 47.1Z",
    },
    {
      color: "#EABB35",
      path: "M46.4 57.8C45.9 56.5 46.2 54 47.2 53.9C48.2 53.8 49.8 54.9 50.5 55.8C52.3 54.9 53.5 54.3 55.4 54.3C56.7 52.6 59 52.1 60.2 53.3C61.3 54.4 61 55.8 60 56.1C61.2 56.4 62.1 56.8 62.9 57.4C64.1 56.3 65.6 55.8 66.2 56.5C66.8 57.2 66.7 59.3 66.2 60.1C69.8 64.2 71.7 69.1 70.9 73.1C70.5 75 69 76.4 67.1 76.9C67.4 78.6 65.9 79.6 63.3 79.6C60.8 79.7 59.5 78.9 59.2 77.8C56.8 78.1 54.3 78 51.9 77.6C51.5 79.1 49.9 79.8 47.7 79.4C45.4 79.1 44.2 78.1 44.8 76.6C42.2 75.5 40.8 73.3 41.2 69.9C41.7 65.3 43.7 60.9 46.4 57.8Z",
    },
  ],
  // The silhouettes' bounds, which the footer sizes the icon by.
  bounds: { x: 21.4, y: 34.4, width: 65.2, height: 45.4 },
  // How far each gap reaches outside its member's outline: half the SVG's
  // 2-unit knockout stroke.
  gap: 1,
} as const;

// The footer's family icon, centred on the wordmark's capitals.
const footerIcon = { height: 16, gap: 4 } as const;

const bulletSize = 4;
const bulletIndent = 13;
const stepNumberSize = 15;
const stepIndent = 24;

interface Run {
  readonly text: string;
  readonly style: TextStyle;
  /** A URL the run's text links to. */
  readonly link?: string;
}

interface Piece {
  readonly run: number;
  readonly text: string;
  readonly x: number;
  readonly width: number;
}

type Line = ReadonlyArray<Piece>;

// Part of one run.
interface Chunk {
  readonly run: number;
  text: string;
}

interface Token {
  readonly kind: "word" | "space" | "newline";
  readonly chunks: Array<Chunk>;
}

const graphemes = new Intl.Segmenter("en-CA", { granularity: "grapheme" });

// Typographic characters Geist lacks, as it can draw them: soft hyphens,
// zero-width spaces and joiners, emoji variation selectors and byte order
// marks are invisible and dropped; thin, narrow no-break, en, em and figure
// spaces become spaces; hyphens and non-breaking hyphens become “-”.
const printable = (text: string) =>
  text
    .replace(/\u00AD|\u200B|\u200D|\uFE0E|\uFE0F|\uFEFF/gu, "")
    .replace(/[\u2002\u2003\u2007\u2009\u202F]/gu, " ")
    .replace(/[\u2010\u2011]/gu, "-");

// Splits runs into words, spaces and hard line breaks. Words run across style
// changes, so a mark followed by “,” wraps as one word.
const tokenize = (runs: ReadonlyArray<Run>) => {
  const tokens: Array<Token> = [];
  runs.forEach((run, index) => {
    const text = printable(run.text).replace(/\r\n?/g, "\n").replaceAll("\t", " ");
    for (const { segment } of graphemes.segment(text)) {
      const kind = segment === "\n" ? "newline" : segment === " " ? "space" : "word";
      const last = tokens.at(-1);
      const chunk = last?.chunks.at(-1);
      if (last?.kind === kind && kind !== "newline" && chunk?.run === index) {
        chunk.text += segment;
      } else {
        const next = { run: index, text: segment };
        if (last?.kind === kind && kind !== "newline") last.chunks.push(next);
        else tokens.push({ kind, chunks: [next] });
      }
    }
  });
  return tokens;
};

/**
 * Lays rich text out in lines no wider than `width`, breaking at spaces and
 * hard line breaks, and inside a word only when it can't fit a line alone.
 * Spaces are kept as written, except where a line wraps.
 */
const layout = (
  measure: (text: string, style: TextStyle) => number,
  runs: ReadonlyArray<Run>,
  width: number,
): ReadonlyArray<Line> => {
  const lines: Array<Array<Piece>> = [];
  let line: Array<Piece> = [];
  let spaces: Array<Piece> = [];
  let x = 0;
  let wrapped = false;

  const chunkWidth = (chunk: Chunk) => measure(chunk.text, runs[chunk.run]?.style ?? styles.body);
  const place = (chunk: Chunk): Piece => {
    const piece = { run: chunk.run, text: chunk.text, x, width: chunkWidth(chunk) };
    x += piece.width;
    return piece;
  };
  const breakLine = (byWrap: boolean) => {
    lines.push(line);
    line = [];
    spaces = [];
    x = 0;
    wrapped = byWrap;
  };

  for (const token of tokenize(runs)) {
    if (token.kind === "newline") {
      breakLine(false);
    } else if (token.kind === "space") {
      // A wrapped line drops the spaces it wrapped at.
      if (line.length > 0 || !wrapped) spaces.push(...token.chunks.map(place));
    } else {
      const wordWidth = token.chunks.reduce((total, chunk) => total + chunkWidth(chunk), 0);
      // The spaces before a word that doesn't fit end the line, undrawn.
      if (x + wordWidth > width && line.length + spaces.length > 0) breakLine(true);
      line.push(...spaces);
      spaces = [];
      if (x + wordWidth <= width) {
        line.push(...token.chunks.map(place));
        continue;
      }
      // Too long for any line: break it between graphemes.
      for (const chunk of token.chunks) {
        for (const { segment } of graphemes.segment(chunk.text)) {
          const part = { run: chunk.run, text: segment };
          if (x + chunkWidth(part) > width && line.length > 0) breakLine(true);
          line.push(place(part));
        }
      }
    }
  }
  lines.push(line);
  return lines.map(merge);
};

// Joins neighbouring pieces of one run so each draws as one string.
const merge = (line: ReadonlyArray<Piece>): Line =>
  line.reduce<Array<Piece>>((merged, piece) => {
    const last = merged.at(-1);
    if (last !== undefined && last.run === piece.run) {
      merged[merged.length - 1] = {
        ...last,
        text: last.text + piece.text,
        width: piece.x + piece.width - last.x,
      };
    } else merged.push(piece);
    return merged;
  }, []);

interface Fonts {
  readonly regular: Buffer;
  readonly semibold: Buffer;
}

interface Drawn {
  readonly bytes: Uint8Array;
  /** Code points drawn with the font's missing glyph. */
  readonly missing: ReadonlySet<number>;
}

const draw = (
  fonts: Fonts,
  coverage: Record<FontName, fontkit.Font>,
  recipe: Recipe,
  photo: Option.Option<Buffer>,
): Promise<Drawn> => {
  const doc = new PDFDocument({
    size: [page.width, page.height],
    margin: 0,
    bufferPages: true,
    lang: "en-CA",
    displayTitle: true,
    info: { Title: recipe.title, Creator: "Goho" },
  });
  const chunks: Array<Uint8Array> = [];
  const done = new Promise<Drawn>((resolve, reject) => {
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve({ bytes: Buffer.concat(chunks), missing }));
  });
  doc.registerFont("regular", fonts.regular);
  doc.registerFont("semibold", fonts.semibold);

  const missing = new Set<number>();
  const use = (style: TextStyle) => doc.font(style.font).fontSize(style.size);
  const measure = (text: string, style: TextStyle) =>
    use(style).widthOfString(text, { characterSpacing: style.tracking ?? 0 });
  const text = (value: string, x: number, baseline: number, style: TextStyle) => {
    for (const character of value) {
      const codePoint = character.codePointAt(0);
      if (codePoint !== undefined && !coverage[style.font].hasGlyphForCodePoint(codePoint))
        missing.add(codePoint);
    }
    use(style)
      .fillColor(style.color)
      .text(value, x, baseline, {
        lineBreak: false,
        baseline: "alphabetic",
        characterSpacing: style.tracking ?? 0,
      });
  };

  // Where drawing continues. The two columns each run down from the same
  // place, so the second goes back to a page the first already filled.
  let pageIndex = 0;
  let y = margin;
  const moveTo = (to: { readonly pageIndex: number; readonly y: number }) => {
    doc.switchToPage(to.pageIndex);
    pageIndex = to.pageIndex;
    y = to.y;
  };
  const ensure = (height: number) => {
    if (y + height <= contentBottom) return;
    if (pageIndex + 1 < doc.bufferedPageRange().count)
      moveTo({ pageIndex: pageIndex + 1, y: margin });
    else {
      doc.addPage();
      pageIndex++;
      y = margin;
    }
  };

  // Font ascent and descent, as fractions of the size, centre text in its line.
  const ascent = coverage.regular.ascent / coverage.regular.unitsPerEm;
  const descent = -coverage.regular.descent / coverage.regular.unitsPerEm;
  const baselineIn = (top: number, lineHeight: number, size: number) =>
    top + (lineHeight - size * (ascent + descent)) / 2 + size * ascent;

  /** Draws laid-out lines from `x`, moving to a new page between lines when needed. */
  const drawLines = (
    runs: ReadonlyArray<Run>,
    lines: ReadonlyArray<Line>,
    x: number,
    lineHeight: number,
    size: number,
    beforeFirst?: (top: number) => void,
  ) => {
    lines.forEach((line, index) => {
      ensure(lineHeight);
      if (index === 0) beforeFirst?.(y);
      const baseline = baselineIn(y, lineHeight, size);
      for (const piece of line) {
        const run = runs[piece.run];
        if (run === undefined) continue;
        text(piece.text, x + piece.x, baseline, run.style);
        if (run.link !== undefined) doc.link(x + piece.x, y, piece.width, lineHeight, run.link);
      }
      y += lineHeight;
    });
  };

  // The photo banner at the top of the first page, already cropped to its shape.
  if (Option.isSome(photo)) {
    doc.save();
    doc.roundedRect(margin, y, photoBox.width, photoBox.height, photoBox.radius).clip();
    doc.image(photo.value, margin, y, { width: photoBox.width, height: photoBox.height });
    doc.restore();
    y += photoBox.height + 22;
  }

  // Title.
  const titleRuns = [{ text: recipe.title, style: styles.title }];
  drawLines(
    titleRuns,
    layout(measure, titleRuns, contentWidth),
    margin,
    lineHeights.title,
    styles.title.size,
  );

  // Total time and yield, when known.
  const stats = [
    recipe.totalTimeSeconds === null
      ? null
      : { label: "Total", value: recipeDuration(recipe.totalTimeSeconds) },
    recipe.yield === null ? null : { label: "Makes", value: recipeYield(recipe.yield) },
  ].filter((stat) => stat !== null);
  if (stats.length > 0) {
    y += 10;
    // Lay the columns out first, so the row moves to a new page whole.
    let x = margin;
    const columns = stats.map((stat, index) => {
      const divider = index > 0 ? x + 14 : null;
      if (divider !== null) x = divider + 14.75;
      const runs = [{ text: stat.value, style: styles.statValue }];
      const lines = layout(measure, runs, margin + contentWidth - x);
      const column = { label: stat.label, runs, lines, x, divider };
      x += Math.max(
        measure(stat.label, styles.statLabel),
        ...lines.map((line) =>
          line.reduce((end, piece) => Math.max(end, piece.x + piece.width), 0),
        ),
      );
      return column;
    });
    const label = (name: string, at: number) =>
      text(name, at, baselineIn(y, lineHeights.statLabel, styles.statLabel.size), styles.statLabel);
    const height =
      Math.max(...columns.map((column) => column.lines.length)) * lineHeights.stat +
      lineHeights.statLabel;
    if (height <= contentBottom - margin) {
      ensure(height);
      const top = y;
      for (const column of columns) {
        if (column.divider !== null) {
          doc
            .rect(column.divider, top + 2, 0.75, lineHeights.stat + lineHeights.statLabel - 2)
            .fill(colors.outline);
        }
        y = top;
        drawLines(column.runs, column.lines, column.x, lineHeights.stat, styles.statValue.size);
        label(column.label, column.x);
      }
      y = top + height;
    } else {
      // Taller than a page: each stat in turn at full width, running across pages.
      for (const column of columns) {
        const lines = layout(measure, column.runs, contentWidth);
        drawLines(column.runs, lines, margin, lineHeights.stat, styles.statValue.size);
        ensure(lineHeights.statLabel);
        label(column.label, margin);
        y += lineHeights.statLabel;
      }
    }
  }

  const ingredients = new Map(recipe.ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const ingredientRuns = recipe.ingredients.map((ingredient): ReadonlyArray<Run> => {
    const line = ingredientLine(ingredient);
    return line.amount === null
      ? [{ text: line.name, style: styles.body }]
      : [
          { text: line.amount, style: styles.amount },
          { text: ` ${line.name}`, style: styles.body },
        ];
  });
  const stepRuns = (step: Step) =>
    stepParts(step, ingredients).map((part): Run => ({
      text: part.text,
      style: part.kind === "mark" ? styles.amount : styles.body,
    }));
  // A lone section's title is never shown; several are always titled.
  const sections = recipe.sections.map((section) => ({
    title:
      recipe.sections.length > 1 && section.title !== null
        ? [{ text: section.title, style: styles.subsection }]
        : null,
    steps: section.steps.map(stepRuns),
  }));

  type Column = (typeof listColumns)[keyof typeof listColumns];

  // A list item's lines, keeping its first two lines together.
  const item = (
    runs: ReadonlyArray<Run>,
    column: Column,
    indent: number,
    gapBefore: number,
    marker: (top: number) => void,
  ) => {
    const lines = layout(measure, runs, column.width - indent);
    y += gapBefore;
    ensure(Math.min(lines.length, 2) * lineHeights.body);
    drawLines(runs, lines, column.x + indent, lineHeights.body, styles.body.size, marker);
  };

  // The height of a list item's first two lines.
  const firstLines = (runs: ReadonlyArray<Run> | undefined, column: Column, indent: number) =>
    Math.min(layout(measure, runs ?? [], column.width - indent).length, 2) * lineHeights.body;
  const subsectionGap = 4;
  // A section title's lines and the height that stays together with them: the
  // title and its first step's first two lines.
  const sectionLead = (section: (typeof sections)[number]) => {
    const lines =
      section.title === null ? [] : layout(measure, section.title, listColumns.steps.width);
    const height = lines.length === 0 ? 0 : lines.length * lineHeights.subsection + subsectionGap;
    return { lines, height: height + firstLines(section.steps[0], listColumns.steps, stepIndent) };
  };

  // Both headings share a row, which stays with each column's first lines.
  y += 24;
  ensure(
    lineHeights.section +
      6 +
      Math.max(
        firstLines(ingredientRuns[0], listColumns.ingredients, bulletIndent),
        sections[0] === undefined ? 0 : sectionLead(sections[0]).height,
      ),
  );
  const headingBaseline = baselineIn(y, lineHeights.section, styles.section.size);
  text("Ingredients", listColumns.ingredients.x, headingBaseline, styles.section);
  text("Steps", listColumns.steps.x, headingBaseline, styles.section);
  y += lineHeights.section + 6;
  const top = { pageIndex, y };

  ingredientRuns.forEach((runs, index) =>
    item(runs, listColumns.ingredients, bulletIndent, index === 0 ? 0 : 3, (at) => {
      doc
        .circle(
          listColumns.ingredients.x + bulletSize / 2,
          at + lineHeights.body / 2,
          bulletSize / 2,
        )
        .fill(colors.accent);
    }),
  );
  const ingredientsEnd = { pageIndex, y };

  moveTo(top);
  sections.forEach((section, sectionIndex) => {
    if (section.title !== null) {
      const lead = sectionLead(section);
      y += sectionIndex === 0 ? 0 : 16;
      ensure(lead.height);
      drawLines(
        section.title,
        lead.lines,
        listColumns.steps.x,
        lineHeights.subsection,
        styles.subsection.size,
      );
      y += subsectionGap;
    }
    // Numbering starts again in each section.
    section.steps.forEach((runs, index) =>
      item(runs, listColumns.steps, stepIndent, index === 0 ? 0 : 9, (at) => {
        const x = listColumns.steps.x;
        const centre = at + lineHeights.body / 2;
        doc.circle(x + stepNumberSize / 2, centre, stepNumberSize / 2).fill(colors.accentContainer);
        const number = new Intl.NumberFormat("en-CA").format(index + 1);
        const width = measure(number, styles.stepNumber);
        text(
          number,
          x + (stepNumberSize - width) / 2,
          centre + (styles.stepNumber.size * (ascent - descent)) / 2,
          styles.stepNumber,
        );
      }),
    );
  });

  // The source's full URL as a link, below whichever column ends later.
  if (recipe.source !== null) {
    if (
      ingredientsEnd.pageIndex > pageIndex ||
      (ingredientsEnd.pageIndex === pageIndex && ingredientsEnd.y > y)
    )
      moveTo(ingredientsEnd);
    // The text reads as saved; the link is its ASCII form, with a punycode host
    // and percent-encoding, as PDFKit writes any other string as UTF-16.
    const link = new URL(recipe.source.url).href;
    const runs = [{ text: recipe.source.url, style: styles.source, link }];
    y += 20;
    drawLines(
      runs,
      layout(measure, runs, contentWidth),
      margin,
      lineHeights.source,
      styles.source.size,
    );
  }

  // The family as vectors, `height` points tall from (x, top). Each later
  // member's gap is painted in white, the page's colour, just outside its
  // outline, as the launcher's mask cuts it; everything stays inside the
  // silhouettes.
  const drawFamily = (x: number, top: number, height: number) => {
    const { bounds, gap, members } = family;
    doc.save();
    doc
      .translate(x, top)
      .scale(height / bounds.height)
      .translate(-bounds.x, -bounds.y);
    for (const member of members) doc.path(member.path);
    doc.clip();
    members.forEach((member, index) => {
      if (index > 0) {
        doc.save();
        doc.rect(0, 0, 108, 108).path(member.path).clip("even-odd");
        doc
          .path(member.path)
          .lineWidth(gap * 2)
          .lineJoin("round")
          .stroke("#FFFFFF");
        doc.restore();
      }
      doc.path(member.path).fill(member.color);
    });
    doc.restore();
  };

  // Footer on every page: the family and a quiet Goho mark, and page numbers
  // when there are several.
  const capHeight = coverage.semibold.capHeight / coverage.semibold.unitsPerEm;
  const iconWidth = (footerIcon.height / family.bounds.height) * family.bounds.width;
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    drawFamily(
      margin,
      footerBaseline - (styles.brand.size * capHeight) / 2 - footerIcon.height / 2,
      footerIcon.height,
    );
    text("Goho", margin + iconWidth + footerIcon.gap, footerBaseline, styles.brand);
    if (range.count > 1) {
      const label = `Page ${index + 1} of ${range.count}`;
      text(
        label,
        margin + contentWidth - measure(label, styles.footer),
        footerBaseline,
        styles.footer,
      );
    }
  }
  doc.end();
  return done;
};

// Upright, cropped from the centre to the banner's shape, flattened onto
// white, and at most the banner's pixels; a smaller photo keeps its own
// resolution rather than being enlarged. Metadata such as location is
// dropped. The original bytes are left untouched.
const preparePhoto = async (photo: Photo): Promise<Buffer> => {
  const image = sharp(photo.bytes, { limitInputPixels: maxPhotoPixels, sequentialRead: true });
  const { width, height } = (await image.metadata()).autoOrient;
  const shape = photoPixels.width / photoPixels.height;
  // The largest crop of the banner's shape the photo holds, down to the banner.
  const cropWidth = Math.min(width, height * shape);
  const scale = Math.min(1, photoPixels.width / cropWidth);
  const outputWidth = Math.max(1, Math.round(cropWidth * scale));
  return image
    .autoOrient()
    .resize({
      width: outputWidth,
      height: Math.max(1, Math.round(outputWidth / shape)),
      fit: "cover",
      position: "centre",
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
};

const fontFile = (path: Path.Path, fileSystem: FileSystem.FileSystem, name: string) =>
  path
    .fromFileUrl(new URL(`../../assets/fonts/${name}`, import.meta.url))
    .pipe(Effect.flatMap((file) => fileSystem.readFile(file)));

const parsed = (bytes: Uint8Array): fontkit.Font => {
  const font = fontkit.create(Buffer.from(bytes));
  if ("fonts" in font) throw new Error("Expected one font, not a collection");
  return font;
};

/**
 * Provides recipe PDF rendering with the bundled Geist fonts, read once, one
 * render at a time. Missing or unreadable font assets are a defect that stops
 * the layer.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fileSystem = yield* FileSystem.FileSystem;
    const regular = yield* fontFile(path, fileSystem, "Geist-Regular.ttf");
    const semibold = yield* fontFile(path, fileSystem, "Geist-SemiBold.ttf");
    const fonts: Fonts = { regular: Buffer.from(regular), semibold: Buffer.from(semibold) };

    const coverage = yield* Effect.try(() => ({
      regular: parsed(regular),
      semibold: parsed(semibold),
    }));

    const usablePhoto = (photo: Photo) =>
      sniffPhotoContentType(photo.bytes) === null
        ? Effect.logWarning("Recipe PDF photo skipped: not a JPEG, PNG or WebP image").pipe(
            Effect.as(Option.none<Buffer>()),
          )
        : Effect.tryPromise(() => preparePhoto(photo)).pipe(
            Effect.asSome,
            Effect.catch((error) =>
              Effect.logWarning("Recipe PDF photo skipped", error).pipe(
                Effect.as(Option.none<Buffer>()),
              ),
            ),
          );

    // Sharp's decoded pixels and PDFKit's buffered document are the biggest
    // memory and CPU cost per request, so the process draws one PDF at a time.
    const turn = yield* Semaphore.make(1);

    // The span covers the drawing, not the wait for a turn.
    const render = Effect.fn("@goho/RecipePdf.render")(function* (
      recipe: Recipe,
      photo: Option.Option<Photo>,
    ) {
      const prepared = Option.isSome(photo) ? yield* usablePhoto(photo.value) : Option.none();
      const drawn = yield* Effect.tryPromise({
        try: () => draw(fonts, coverage, recipe, prepared),
        catch: (cause) => new PdfError({ cause }),
      });
      if (drawn.missing.size > 0) {
        yield* Effect.logWarning("Recipe PDF has characters its font lacks", {
          codePoints: [...drawn.missing].map(
            (codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
          ),
        });
      }
      return drawn.bytes;
    });

    // Sharp can't be aborted, so an interrupted render still finishes before
    // the next takes its turn; waiting for a turn stays interruptible.
    return Service.of({
      render: (recipe, photo) => turn.withPermit(Effect.uninterruptible(render(recipe, photo))),
    });
  }).pipe(Effect.orDie),
);
