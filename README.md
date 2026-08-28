# Chronolizer

Chronolizer is an Effect v4 library for bidirectional natural-language date ranges.

It converts complete English, German, and Spanish date-range expressions to a small date-math format. It also renders supported ranges to canonical natural language and resolves the AST with an explicit Effect time zone.

## Status

This package uses `effect@4.0.0-rc.112`. Its API can change while Effect v4 is in release-candidate status.

## Package entry points

Chronolizer is side-effect free and publishes separate ESM entry points:

```ts
import { parseFilter, resolve } from "chronolizer/ast";
import { parseNatural, suggestNatural } from "chronolizer/parse";
import { formatNatural } from "chronolizer/format";
import { EnglishLanguageLayer } from "chronolizer/locales/en";
```

- `chronolizer/ast` contains the AST, compact filter codec, and resolver.
- `chronolizer/parse` contains natural-text parsing, autocomplete, and language plugins. It does not load natural rendering.
- `chronolizer/format` contains AST-to-natural rendering. It does not load parsing or autocomplete.
- `chronolizer/locales/en`, `chronolizer/locales/de`, `chronolizer/locales/es`, and `chronolizer/locales/default` expose language packs separately.
- `chronolizer` and `chronolizer/locales/default` include English only.
- Every non-English language must be imported from its own locale subpath.

The package build runs Publint and Are the Types Wrong. CI also checks transitive gzip limits and rejects a parse entry that imports formatting code, a format entry that imports parsing code, or an AST entry that imports either natural-language capability.

## Main concepts

- Effect Schema owns the date AST, filter data, results, and errors.
- Complete periods are half-open: `[start, next period start)`.
- Open ranges are supported.
- Weeks always start on Monday.
- Parsing does not read the clock or host time zone.
- Resolution requires `DateTime.CurrentTimeZone`.
- Natural rendering is canonical. It does not reproduce the source wording.
- Typo correction is conservative and optional. It does not change numbers, ISO dates, or short ambiguous words.

## Natural language to filter

```ts
import { DefaultLanguageLayer, formatFilter, parseNatural } from "chronolizer";
import { Effect } from "effect";

const run = Effect.fn(function* () {
  const result = yield* parseNatural("January of last year", {
    locale: "en",
    typoMode: "strict",
  });

  return formatFilter(result.range);
}, Effect.provide(DefaultLanguageLayer));

const program = run();

// { gte: "now-1y/y", lt: "now-1y/y+1M" }
```

Other examples:

```text
year to date                    -> { gte: "now/y", lte: "now" }
January 2025                    -> { gte: "2025-01-01", lt: "2025-02-01" }
since January 2025              -> { gte: "2025-01-01" }
before January 2025             -> { lt: "2025-01-01" }
through January 2025            -> { lt: "2025-02-01" }
last 3 months                   -> { gte: "now-3M", lte: "now" }
30 months ago                   -> { gte: "now-30M/M", lt: "now-30M/M+1M" }
01 January 2025 - 31 January 2025
                                -> { gte: "2025-01-01", lt: "2025-02-01" }
Q1 2025                         -> { gte: "2025-01-01", lt: "2025-04-01" }
Januar letzten Jahres           -> { gte: "now-1y/y", lt: "now-1y/y+1M" }
die letzten 3 Monate            -> { gte: "now-3M", lte: "now" }
seit Jahresbeginn               -> { gte: "now/y", lte: "now" }
seit Januar 2025                -> { gte: "2025-01-01" }
```

Chronolizer parses the complete input. It does not extract a date phrase from a larger sentence.

Supported families include named and abbreviated months, named dates, quarters, weekends, period starts and ends, past and future rolling windows, calendar offsets, open boundaries, `now`-bounded ranges, and explicit inclusive connectors. Each language uses its own grammar and canonical forms.

## Autocomplete natural language

Use `suggestNatural()` for autocomplete fields. Each Schema-owned suggestion contains canonical display text and the semantic range that it represents:

```ts
import { DefaultLanguageLayer, suggestNatural } from "chronolizer";
import { Effect } from "effect";

const program = suggestNatural("last m", {
  locale: "en",
  limit: 5,
}).pipe(Effect.provide(DefaultLanguageLayer));

// [{ text: "last month", range: ... }]
```

Suggestions support incomplete words, bounded spelling errors, numeric rolling periods, and partial four-digit years. For example, `january 202` suggests `January 2020`, `January 2021`, and later matching years. Every returned suggestion is checked by the exact parser. `allowFuture: false` applies the same positive-relative-range policy as `parseNatural()`.

The default limit is 10. The maximum accepted limit is 100. A nonpositive or invalid limit returns no suggestions.

### Exclude positive relative ranges

Set `allowFuture: false` to reject expressions whose relative range extends after `now`:

```ts
const program = parseNatural("next 3 months", {
  locale: "en",
  allowFuture: false,
});
```

This option rejects relative forms such as `next month`, `this year`, and `in 3 years`. It does not classify fixed dates such as `January 2099`, because parsing does not read the clock.

## Filter to natural language

```ts
import { formatNatural, parseFilter } from "chronolizer";
import { GermanLanguageLayer } from "chronolizer/locales/de";
import { Effect } from "effect";

const run = Effect.fn(function* () {
  const range = yield* parseFilter({
    gte: "2025-01-01",
    lt: "2025-02-01",
  });

  return yield* formatNatural(range, { locale: "de" });
}, Effect.provide(GermanLanguageLayer));

const program = run();

// "Januar 2025"
```

Natural language is many-to-one. Chronolizer therefore guarantees semantic round trips, not the original words.

## Validate external filters

`parseFilter` accepts a validated `DateFilter`. Decode external data with the exported Schema first:

```ts
import { DateFilter, parseFilter } from "chronolizer";
import { Effect, Schema } from "effect";

const decodeDateFilter = Schema.decodeUnknownEffect(DateFilter);

const program = decodeDateFilter(externalInput).pipe(Effect.flatMap(parseFilter));
```

A filter has at most one lower bound (`gt` or `gte`), at most one upper bound (`lt` or `lte`), and at least one bound.

## Compact expression syntax

```text
expression := anchor operation*
anchor     := "now" | YYYY-MM-DD | YYYY-MM-DD "||"
operation  := ("+" | "-") positiveInteger unit | "/" unit
unit       := "d" | "w" | "M" | "q" | "y"
```

Examples:

```text
now/y
now-1y/y
now-1y/y+1M
2025-01-01
2025-01-01||+1M
```

Operations run from left to right. `/unit` floors to the start of the calendar unit. Fixed dates require `||` before operations.

## Resolve with an explicit time zone

```ts
import { parseFilter, resolve } from "chronolizer";
import { DateTime, Effect } from "effect";

const run = Effect.fn(function* () {
  const range = yield* parseFilter({ gte: "now/y", lte: "now" });
  return yield* resolve(range);
}, DateTime.withCurrentZoneNamed("Europe/Berlin"));

const program = run();
```

The resolver uses Effect Clock and `DateTime.CurrentTimeZone`. It never uses the host local time zone without an explicit caller decision. Named zones use the runtime ICU time-zone data.

## Tolerant parsing

```ts
const program = parseNatural("januray of last yaer", {
  locale: "en",
  typoMode: "tolerant",
});
```

The result reports:

- `quality`: `exact`, `corrected`, or `ambiguous`;
- each correction and edit distance;
- semantic alternatives for equal-cost ties.

Strict mode never runs correction.

## Language plugins

`LanguageRegistry` is an Effect service. A language is a scoped plugin contribution. `languagePluginsLayer` validates plugin identifiers, rejects conflicting base languages, applies deterministic extension order, and removes registrations when the Layer scope closes.

Language identifiers use canonical BCP 47 base tags. Lookup removes one subtag at a time. For example, `zh-Hant-TW` tries `zh-Hant-TW`, `zh-Hant`, and then `zh`.

Each base language owns:

- exact parsing and canonical rendering;
- autocomplete phrase generation;
- optional text normalization;
- its typo-correction strategy, which can be disabled;
- vocabulary shared with registered language extensions.

Language extensions can add both exact parsers and autocomplete phrases. The registry combines extension suggestions in the same deterministic order as extension parsers. The core accepts only suggestions that one of the compiled exact parsers can parse.

`normalizeNaturalText` and `correctWhitespaceSeparatedText` are available for languages that use whitespace-separated words. A compact-script language can provide character, dictionary, or `Intl.Segmenter` based correction without changing Chronolizer core.

Built-in plugins:

- `EnglishLanguage`
- `GermanLanguage`
- `SpanishLanguage`
- `DefaultLanguageLayer` (English only)

Import every non-English language from its locale subpath. This keeps the default bundle small and makes language selection explicit.

Chinese and Japanese language packs are not included yet.

Business calendars, holidays, times of day, recurrence, and sentence extraction are outside v1. A future business-day feature will use an injected calendar service.

## License

Chronolizer is available under the [MIT License](LICENSE).
