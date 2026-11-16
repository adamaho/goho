// RFC 9110 media type tokens and qvalues; a qvalue has at most three decimals.
const token = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const qvalue = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

interface MediaRange {
  readonly type: string;
  readonly subtype: string;
  readonly q: number;
}

// Malformed ranges, such as `json`, `*/json` or a bad q, are ignored. Media
// range parameters other than q are ignored too, as no offered type has any.
// Splitting on commas would cut a quoted value such as `x="a,b"` and could
// detach its range's q, so any piece with a quote is ignored.
const mediaRanges = (accept: string): ReadonlyArray<MediaRange> =>
  accept.split(",").flatMap((element) => {
    if (element.includes('"')) return [];
    const [range = "", ...parameters] = element.split(";").map((part) => part.trim());
    const [type = "", subtype = "", ...rest] = range.toLowerCase().split("/");
    if (rest.length > 0 || !token.test(type) || !token.test(subtype)) return [];
    if (type === "*" && subtype !== "*") return [];
    let q = 1;
    for (const parameter of parameters) {
      const [name = "", value = ""] = parameter.split("=").map((part) => part.trim());
      if (name.toLowerCase() !== "q") continue;
      if (!qvalue.test(value)) return [];
      q = Number(value);
    }
    return [{ type, subtype, q }];
  });

// The most specific matching ranges and their weight: `type/subtype` (2) over
// `type/*` (1) over `*/*` (0), taking the highest q among equally specific
// ones. A type no range matches has q 0.
const match = (ranges: ReadonlyArray<MediaRange>, offer: string) => {
  const [type, subtype] = offer.split("/");
  let best = { specificity: -1, q: 0 };
  for (const range of ranges) {
    const specificity =
      range.type === "*"
        ? 0
        : range.type !== type
          ? -1
          : range.subtype === "*"
            ? 1
            : range.subtype === subtype
              ? 2
              : -1;
    if (specificity < 0) continue;
    if (specificity > best.specificity || (specificity === best.specificity && range.q > best.q)) {
      best = { specificity, q: range.q };
    }
  }
  return best;
};

/**
 * The offered media type an `Accept` header prefers, by RFC 9110 content
 * negotiation: `type/*` and `*\/*` wildcards, the most specific matching range
 * deciding each type's q, and `q=0` ruling a type out. The highest q wins; on
 * a tie, the type named by the more specific range, so `application/pdf, *\/*`
 * prefers the PDF; then the first of `offers`, which are lowercase
 * `type/subtype` in the server's order of preference. A missing header, or one
 * without a single well-formed range, such as `,`, accepts anything, so the
 * first offer wins. `undefined` when the header accepts no offer, for a 406.
 *
 * @category parsing
 * @since 0.1.0
 */
export const preferredMediaType = <const Offer extends string>(
  accept: string | undefined,
  offers: readonly [Offer, ...Array<Offer>],
): Offer | undefined => {
  const ranges = accept === undefined ? [] : mediaRanges(accept);
  if (ranges.length === 0) return offers[0];
  let preferred: { offer: Offer; q: number; specificity: number } | undefined;
  for (const offer of offers) {
    const { q, specificity } = match(ranges, offer);
    if (q === 0) continue;
    if (
      preferred === undefined ||
      q > preferred.q ||
      (q === preferred.q && specificity > preferred.specificity)
    ) {
      preferred = { offer, q, specificity };
    }
  }
  return preferred?.offer;
};
