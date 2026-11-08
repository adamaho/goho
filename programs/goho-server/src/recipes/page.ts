import { Predicate, Result } from "effect";

import type { PageContent } from "./model.ts";

const entities: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

// Covers the entities markup needs; others stay as written for the model to read.
const decodeEntities = (value: string) =>
  value.replace(/&(#x[\da-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = hex ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return entities.get(entity.toLowerCase()) ?? match;
  });

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

const nonBlank = (value: string | undefined) => {
  const collapsed = value === undefined ? "" : collapse(decodeEntities(value));
  return collapsed === "" ? null : collapsed;
};

// Reads attributes left to right; each match consumes its text, so no position
// is retried and hostile tags stay linear.
const attributes = (tag: string) => {
  const found = new Map<string, string>();
  const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]*)))?/y;
  for (let index = 0; index < tag.length;) {
    attribute.lastIndex = index;
    const match = attribute.exec(tag);
    if (match === null) {
      index++;
      continue;
    }
    index = attribute.lastIndex;
    const name = match[1]?.toLowerCase();
    if (name !== undefined && !found.has(name))
      found.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return found;
};

const decoderFor = (label: string | undefined) =>
  label === undefined
    ? undefined
    : Result.getOrUndefined(Result.try(() => new TextDecoder(label.trim())));

const charsetOf = (value: string) => /charset\s*=\s*["']?([^"';\s]+)/i.exec(value)?.[1];

// The first <meta> in the first 1024 bytes that names a known encoding, read
// as ASCII-compatible bytes the way the HTML standard's prescan does.
const metaDecoder = (body: Uint8Array) => {
  const head = new TextDecoder("windows-1252").decode(body.subarray(0, 1024));
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const found = attributes(tag);
    const content = found.get("content");
    const label =
      found.get("charset") ??
      (found.get("http-equiv")?.trim().toLowerCase() === "content-type" && content !== undefined
        ? charsetOf(content)
        : undefined);
    const decoder = decoderFor(label);
    if (decoder !== undefined) {
      // A page cannot declare UTF-16 about itself in ASCII; the standard reads it as UTF-8.
      return decoder.encoding.startsWith("utf-16") ? new TextDecoder() : decoder;
    }
  }
  return undefined;
};

const bomDecoder = (body: Uint8Array) => {
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) return new TextDecoder("utf-8");
  if (body[0] === 0xfe && body[1] === 0xff) return new TextDecoder("utf-16be");
  if (body[0] === 0xff && body[1] === 0xfe) return new TextDecoder("utf-16le");
  return undefined;
};

/**
 * Decodes an HTML body in the HTML standard's order: a byte order mark, then
 * the HTTP `Content-Type` charset, then a `<meta>` charset in the first 1024
 * bytes, then UTF-8. An unknown label is skipped in favour of the next source.
 *
 * @category parsing
 * @since 0.1.0
 */
export const decode = (body: Uint8Array, contentType: string): string =>
  (
    bomDecoder(body) ??
    decoderFor(charsetOf(contentType.split(";").slice(1).join(";"))) ??
    metaDecoder(body) ??
    new TextDecoder()
  ).decode(body);

const isRecipeType = (type: unknown): boolean =>
  Predicate.isString(type)
    ? /(?:^|[/:])Recipe$/.test(type)
    : Array.isArray(type) && type.some(isRecipeType);

// Finds Recipe nodes anywhere in a JSON-LD document, such as inside @graph or
// mainEntity, without looking inside a recipe for more.
const findRecipes = (value: unknown, found: Array<object>, depth = 0) => {
  if (depth > 32) return;
  if (Array.isArray(value)) {
    for (const item of value) findRecipes(item, found, depth + 1);
  } else if (Predicate.isObject(value)) {
    if (Predicate.hasProperty(value, "@type") && isRecipeType(value["@type"])) found.push(value);
    else for (const item of Object.values(value)) findRecipes(item, found, depth + 1);
  }
};

// schema.org images are a URL, an ImageObject, or a list of either.
const imageOf = (value: unknown): string | undefined => {
  if (Predicate.isString(value)) return value;
  if (Array.isArray(value)) return value.map(imageOf).find(Predicate.isNotUndefined);
  if (!Predicate.isObject(value)) return undefined;
  return (
    (Predicate.hasProperty(value, "url") ? imageOf(value.url) : undefined) ??
    (Predicate.hasProperty(value, "contentUrl") ? imageOf(value.contentUrl) : undefined)
  );
};

const absoluteHttpUrl = (value: string | undefined, base: URL) => {
  const url = value === undefined ? null : URL.parse(decodeEntities(value).trim(), base.href);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:") ? url.href : null;
};

// Elements whose content is never visible recipe text, skipped up to the
// matching close tag; a JSON-LD script is read before it is skipped.
const skipped: ReadonlySet<string> = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
]);

// Site chrome: its text is left out, but its markup is still read, because
// sites such as WordPress print JSON-LD in the footer.
const chrome: ReadonlySet<string> = new Set(["nav", "footer"]);
const lineBreaks: ReadonlySet<string> = new Set([
  "br",
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "tr",
  "table",
  "section",
  "article",
  "header",
  "main",
]);

/**
 * Reads the parts of an HTML page a recipe can come from, in one linear pass
 * so hostile markup cannot make it slow. `url` is where the fetch ended, for
 * resolving a relative photo URL. Malformed JSON-LD is skipped. The photo is
 * the only Recipe object's image, or else the page's Open Graph or Twitter
 * image.
 *
 * @category parsing
 * @since 0.1.0
 */
export const parse = (html: string, url: URL): PageContent => {
  // ASCII only, so indexes into `lower` stay valid in `html`.
  const lower = html.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
  const structuredRecipes: Array<object> = [];
  const meta = new Map<string, string>();
  const text: Array<string> = [];
  // Open nav and footer elements around the current position.
  let chromeDepth = 0;
  const emit = (value: string) => {
    if (chromeDepth === 0) text.push(value);
  };
  let title: string | undefined;

  for (let index = 0; index < html.length;) {
    const open = html.indexOf("<", index);
    emit(html.slice(index, open === -1 ? html.length : open));
    if (open === -1) break;
    if (lower.startsWith("<!--", open)) {
      const end = lower.indexOf("-->", open + 4);
      if (end === -1) break;
      index = end + 3;
      continue;
    }
    const close = html.indexOf(">", open);
    if (close === -1) break;
    index = close + 1;
    const tag = html.slice(open, index);
    const name = /^<\/?([a-z][a-z0-9-]*)/.exec(lower.slice(open, open + 32))?.[1];
    if (name === undefined || tag[1] === "/") {
      if (name !== undefined && chrome.has(name) && chromeDepth > 0) chromeDepth--;
      emit(name !== undefined && lineBreaks.has(name) ? "\n" : " ");
      continue;
    }
    if (chrome.has(name)) {
      emit("\n");
      chromeDepth++;
      continue;
    }
    if (name === "meta") {
      const found = attributes(tag);
      const key = (found.get("property") ?? found.get("name"))?.toLowerCase();
      const content = found.get("content");
      if (key !== undefined && content !== undefined && !meta.has(key)) meta.set(key, content);
    }
    if (name === "title" || skipped.has(name)) {
      const end = lower.indexOf(`</${name}`, index);
      const content = html.slice(index, end === -1 ? html.length : end);
      if (name === "title") title ??= content;
      if (
        name === "script" &&
        /^application\/ld\+json$/i.test(attributes(tag).get("type")?.trim() ?? "")
      ) {
        // Pages often ship broken JSON-LD; the visible text still has the recipe.
        Result.match(
          Result.try(() => JSON.parse(content)),
          {
            onFailure: () => undefined,
            onSuccess: (json) => findRecipes(json, structuredRecipes),
          },
        );
      }
      if (end === -1) break;
      const endClose = html.indexOf(">", end);
      index = endClose === -1 ? html.length : endClose + 1;
      emit(" ");
      continue;
    }
    emit(name === "li" ? "\n- " : lineBreaks.has(name) ? "\n" : " ");
  }

  const [only] = structuredRecipes;
  const recipeImage =
    structuredRecipes.length === 1 && Predicate.hasProperty(only, "image")
      ? imageOf(only.image)
      : undefined;

  return {
    title: nonBlank(title) ?? nonBlank(meta.get("og:title")),
    description: nonBlank(meta.get("og:description") ?? meta.get("description")),
    structuredRecipes,
    text: decodeEntities(text.join(""))
      .split("\n")
      .map(collapse)
      .filter((line) => line !== "" && line !== "-")
      .join("\n"),
    imageUrl: absoluteHttpUrl(
      recipeImage ?? meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image"),
      url,
    ),
  };
};
