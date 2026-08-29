# Chronolizer

Chronolizer is an Effect 4 library that converts natural-language date ranges to compact date-math filters and back. It supports open ranges, autocomplete, typo correction, and eight languages.

```text
year to date          → { gte: "now/y", lte: "now" }
January of last year  → { gte: "now-1y/y", lt: "now-1y/y+1M" }
since January 2025    → { gte: "2025-01-01" }
```

> [!NOTE]
> Chronolizer currently uses `effect@4.0.0-rc.112`. The API can change while Effect v4 has release-candidate status.

## Install Chronolizer

```sh
pnpm add chronolizer effect@4.0.0-rc.112
```

Chronolizer works only with Effect 4. Install `effect` as a direct dependency. Its natural-language and resolution APIs return Effect values and use Effect services. Keep these values in your Effect program, as the following examples do. Chronolizer also requires ESM.

## Parse your first date range

English is available from the main package entry.

```ts
import { EnglishLanguageLayer, formatFilter, parseNatural } from "chronolizer";
import { Effect } from "effect";

const program = parseNatural("January of last year", { locale: "en" }).pipe(
  Effect.map(({ range }) => formatFilter(range)),
  Effect.tap((filter) => Effect.log("Date filter", filter)),
  Effect.provide(EnglishLanguageLayer),
);

Effect.runPromise(program);
// { gte: "now-1y/y", lt: "now-1y/y+1M" }
```

`parseNatural` parses the complete input. It does not extract a date range from a longer sentence.

## Common tasks

### Parse other languages

Import each non-English language from its own package entry. This keeps unused languages out of your bundle.

```ts
import { formatFilter, parseNatural } from "chronolizer";
import { GermanLanguageLayer } from "chronolizer/locales/de";
import { Effect } from "effect";

const program = parseNatural("seit Jahresbeginn", { locale: "de" }).pipe(
  Effect.map(({ range }) => formatFilter(range)),
  Effect.tap((filter) => Effect.log("Datumsfilter", filter)),
  Effect.provide(GermanLanguageLayer),
);

Effect.runPromise(program);
// { gte: "now/y", lte: "now" }
```

Use `languagePluginsLayer` when one application needs more than one language:

```ts
import { EnglishLanguage, languagePluginsLayer, parseNatural } from "chronolizer";
import { GermanLanguage } from "chronolizer/locales/de";
import { PolishLanguage } from "chronolizer/locales/pl";
import { Effect } from "effect";

const Languages = languagePluginsLayer([EnglishLanguage, GermanLanguage, PolishLanguage]);

const program = parseNatural("letzten Monat", { locale: "de" }).pipe(Effect.provide(Languages));

Effect.runPromise(program);
```

### Format a range as natural language

`formatNatural` returns the canonical phrase for a range. It preserves the meaning, but it does not reproduce the original wording.

```ts
import { formatNatural, parseFilter } from "chronolizer";
import { GermanLanguageLayer } from "chronolizer/locales/de";
import { Effect } from "effect";

const program = parseFilter({ gte: "2025-01-01", lt: "2025-02-01" }).pipe(
  Effect.flatMap((range) => formatNatural(range, { locale: "de" })),
  Effect.tap((text) => Effect.log("Date range", text)),
  Effect.provide(GermanLanguageLayer),
);

Effect.runPromise(program);
// "Januar 2025"
```

### Add autocomplete

`suggestNatural` returns valid canonical phrases and their semantic ranges.

```ts
import { EnglishLanguageLayer, suggestNatural } from "chronolizer";
import { Effect } from "effect";

const program = suggestNatural("last m", { locale: "en", limit: 5 }).pipe(
  Effect.tap((suggestions) => Effect.log("Suggestions", suggestions)),
  Effect.provide(EnglishLanguageLayer),
);

Effect.runPromise(program);
// [{ text: "last month", range: ... }, ...]
```

The default limit is 10. The maximum limit is 100. A nonpositive or invalid limit returns no suggestions.

### Accept spelling errors

Set `typoMode` to `"tolerant"` for conservative correction:

```ts
const program = parseNatural("januray of last yaer", {
  locale: "en",
  typoMode: "tolerant",
});
```

The successful value contains its `quality`, applied `corrections`, and any semantic `alternatives`. Strict mode is the default and does not correct the input.

### Exclude future relative ranges

Set `allowFuture` to `false` for fields that accept only past relative ranges:

```ts
const program = parseNatural("next 3 months", {
  locale: "en",
  allowFuture: false,
});
```

This option rejects positive relative forms such as `next month` and `in 3 years`. It does not compare fixed dates, such as `January 2099`, with the current date. Parsing does not read the clock.

The same option is available in `suggestNatural`.

### Resolve a range to dates

Provide an Effect time zone when you resolve relative expressions:

```ts
import { parseFilter, resolve } from "chronolizer";
import { DateTime, Effect } from "effect";

const program = parseFilter({ gte: "now/y", lte: "now" }).pipe(
  Effect.flatMap(resolve),
  DateTime.withCurrentZoneNamed("Europe/Berlin"),
);

Effect.runPromise(program);
```

`resolve` uses the Effect clock and `DateTime.CurrentTimeZone`. It does not use the host time zone without your decision.

### Validate an external filter

Use the exported Effect Schema before you parse unknown data:

```ts
import { DateFilter, parseFilter } from "chronolizer";
import { Effect, Schema } from "effect";

const program = Schema.decodeUnknownEffect(DateFilter)(externalInput).pipe(
  Effect.flatMap(parseFilter),
);

Effect.runPromise(program);
```

## Supported expressions

Supported input families include:

- calendar days, weeks, months, quarters, and years;
- rolling ranges, such as `last 3 months`;
- calendar offsets, such as `30 months ago`;
- period-to-date ranges, such as `year to date`;
- fixed months, quarters, years, and explicit date intervals;
- open ranges, such as `since January 2025` and `before 2020`;
- period starts, period ends, and weekends;
- abbreviated month names and common equivalent phrases.

Examples:

| Input                               | Filter                                     |
| ----------------------------------- | ------------------------------------------ |
| `today`                             | `{ gte: "now/d", lt: "now/d+1d" }`         |
| `last 3 months`                     | `{ gte: "now-3M", lte: "now" }`            |
| `30 months ago`                     | `{ gte: "now-30M/M", lt: "now-30M/M+1M" }` |
| `January 2025`                      | `{ gte: "2025-01-01", lt: "2025-02-01" }`  |
| `Q1 2025`                           | `{ gte: "2025-01-01", lt: "2025-04-01" }`  |
| `01 January 2025 - 31 January 2025` | `{ gte: "2025-01-01", lt: "2025-02-01" }`  |
| `through January 2025`              | `{ lt: "2025-02-01" }`                     |

## Supported languages

| Language | Locale | Import                                    |
| -------- | ------ | ----------------------------------------- |
| English  | `en`   | `chronolizer` or `chronolizer/locales/en` |
| German   | `de`   | `chronolizer/locales/de`                  |
| Spanish  | `es`   | `chronolizer/locales/es`                  |
| French   | `fr`   | `chronolizer/locales/fr`                  |
| Dutch    | `nl`   | `chronolizer/locales/nl`                  |
| Turkish  | `tr`   | `chronolizer/locales/tr`                  |
| Czech    | `cs`   | `chronolizer/locales/cs`                  |
| Polish   | `pl`   | `chronolizer/locales/pl`                  |

## Date filter reference

A date filter has at least one bound. It can have one lower bound and one upper bound.

| Key   | Meaning                     |
| ----- | --------------------------- |
| `gt`  | After the value, exclusive  |
| `gte` | On or after the value       |
| `lt`  | Before the value, exclusive |
| `lte` | On or before the value      |

An expression starts with `now` or an ISO date. Operations run from left to right.

```text
expression := anchor operation*
anchor     := "now" | YYYY-MM-DD | YYYY-MM-DD "||"
operation  := ("+" | "-") positiveInteger unit | "/" unit
unit       := "d" | "w" | "M" | "q" | "y"
```

`/unit` moves a value to the start of its calendar unit. Add `||` before operations on a fixed date, for example `2025-01-01||+1M`.

Complete calendar periods use a half-open interval: the lower bound is inclusive and the next period start is exclusive. Weeks start on Monday.

## Main API

| Export                | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `parseNatural`        | Parse complete natural-language input to a semantic range           |
| `formatNatural`       | Render a supported range as a canonical phrase                      |
| `suggestNatural`      | Return autocomplete suggestions and semantic ranges                 |
| `parseFilter`         | Parse a date filter to a semantic range                             |
| `formatFilter`        | Format a semantic range as a date filter                            |
| `resolve`             | Resolve a semantic range with an Effect clock and time zone         |
| `DateFilter`          | Validate external date-filter data with Effect Schema               |
| `DateRangeFromFilter` | Decode and encode a filter through one Effect Schema transformation |

## License

Chronolizer is available under the [MIT License](LICENSE).
