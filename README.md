# Chronolizer

Chronolizer is an Effect v4 library for bidirectional natural-language date ranges.

It converts complete English and German date-range expressions to a small date-math format. It also renders supported ranges to canonical natural language and resolves the AST with an explicit Effect time zone.

## Status

This package uses `effect@4.0.0-rc.112`. Its API can change while Effect v4 is in release-candidate status.

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

const program = Effect.gen(function* () {
  const result = yield* parseNatural("January of last year", {
    locale: "en",
    typoMode: "strict",
  });

  return formatFilter(result.range);
}).pipe(Effect.provide(DefaultLanguageLayer));

// { gte: "now-1y/y", lt: "now-1y/y+1M" }
```

Other examples:

```text
year to date                    -> { gte: "now/y", lte: "now" }
January 2025                    -> { gte: "2025-01-01", lt: "2025-02-01" }
since January 2025              -> { gte: "2025-01-01" }
before January 2025             -> { lt: "2025-01-01" }
through January 2025            -> { lt: "2025-02-01" }
Januar letzten Jahres           -> { gte: "now-1y/y", lt: "now-1y/y+1M" }
seit Januar 2025                -> { gte: "2025-01-01" }
```

Chronolizer parses the complete input. It does not extract a date phrase from a larger sentence.

## Filter to natural language

```ts
import { DefaultLanguageLayer, formatNatural, parseFilter } from "chronolizer";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const range = yield* parseFilter({
    gte: "2025-01-01",
    lt: "2025-02-01",
  });

  return yield* formatNatural(range, { locale: "de" });
}).pipe(Effect.provide(DefaultLanguageLayer));

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

const program = Effect.gen(function* () {
  const range = yield* parseFilter({ gte: "now/y", lte: "now" });
  return yield* resolve(range);
}).pipe(DateTime.withCurrentZoneNamed("Europe/Berlin"));
```

The resolver uses Effect Clock and `DateTime.CurrentTimeZone`. It never uses the host local time zone without an explicit caller decision. Named zones use the runtime ICU time-zone data.

## Tolerant parsing

```ts
const result =
  yield *
  parseNatural("januray of last yaer", {
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

Built-in plugins:

- `EnglishLanguage`
- `GermanLanguage`
- `DefaultLanguageLayer`

Business calendars, holidays, times of day, recurrence, and sentence extraction are outside v1. A future business-day feature will use an injected calendar service.
