# Chronolizer

Chronolizer is an Effect 4 library that converts natural-language date ranges to compact date filters and back. It supports ranges without a start or end, autocomplete, spelling correction, and eight languages.

```text
year to date          → { gte: "now/y", lte: "now" }
January of last year  → { gte: "now-1y/y", lt: "now-1y/y+1M" }
since January 2025    → { gte: "2025-01-01" }
```

> [!NOTE]
> Chronolizer currently uses `effect@4.0.0-rc.112`. Effect 4 is not stable yet, so its API can change.

## Install Chronolizer

Chronolizer requires Effect 4 and uses ES modules. Install both packages:

```sh
pnpm add chronolizer effect@4.0.0-rc.112
```

## Parse your first date range

English is available from the main package.

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

Import each non-English language separately. This keeps unused language code out of your build.

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

Use `languagePluginsLayer` to combine languages:

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

`formatNatural` returns one standard phrase for a range. It preserves the meaning, but it does not reproduce the original wording. Absolute days use the language's numeric `Intl.DateTimeFormat` form.

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

`suggestNatural` returns valid standard phrases and their date ranges.

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

Set `typoMode` to `"tolerant"` to correct close spelling errors:

```ts
const program = parseNatural("januray of last yaer", {
  locale: "en",
  typoMode: "tolerant",
});
```

The result contains its `quality`, applied `corrections`, and any `alternatives` with a different meaning. Strict mode is the default and does not correct the input.

### Exclude future ranges

Set `allowFuture` to `false` to reject periods after the current period:

```ts
const program = parseNatural("next 3 months", {
  locale: "en",
  allowFuture: false,
});
```

This option rejects forms such as `next month`, `next 3 weeks`, and `in 3 years`. It keeps complete current calendar periods such as `today`, `this week`, and `this month`. It does not change them to ranges that end at the current time.

The option does not compare fixed dates, such as `January 2099`, with the current date. Parsing does not read the clock.

The same option is available in `suggestNatural`.

### Resolve a range to dates

Provide an Effect time zone when you calculate ranges based on the current date:

```ts
import { parseFilter, resolve } from "chronolizer";
import { DateTime, Effect } from "effect";

const program = parseFilter({ gte: "now/y", lte: "now" }).pipe(
  Effect.flatMap(resolve),
  DateTime.withCurrentZoneNamed("Europe/Berlin"),
);

Effect.runPromise(program);
```

`resolve` uses the Effect clock and `DateTime.CurrentTimeZone`. It uses only the time zone that you provide.

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

## Supported input

You can parse:

- days, weeks, months, quarters, and years;
- ranges with a length, such as `last 3 months`;
- single periods in the past or future, such as `30 months ago`;
- ranges from a period start to now, such as `year to date`;
- fixed months, quarters, years, and date ranges;
- named days with or without a year, such as `January 12` and `12th of January`;
- ranges without one end, such as `since January 2025` and `from January 12`;
- written counts from one through ninety-nine, such as `two weeks ago` and `twenty-one weeks ago`;
- combined phrases, such as `the day before January 12` and `yesterday two weeks ago`;
- period starts, period ends, and weekends;
- abbreviated month names and common equivalent phrases.

Examples:

| Input                               | Filter                                     |
| ----------------------------------- | ------------------------------------------ |
| `today`                             | `{ gte: "now/d", lt: "now/d+1d" }`         |
| `last 3 months`                     | `{ gte: "now-3M", lte: "now" }`            |
| `30 months ago`                     | `{ gte: "now-30M/M", lt: "now-30M/M+1M" }` |
| `January 2025`                      | `{ gte: "2025-01-01", lt: "2025-02-01" }`  |
| `January 12`                        | `{ gte: "now/y+11d", lt: "now/y+12d" }`    |
| `Q1 2025`                           | `{ gte: "2025-01-01", lt: "2025-04-01" }`  |
| `01 January 2025 - 31 January 2025` | `{ gte: "2025-01-01", lt: "2025-02-01" }`  |
| `through January 2025`              | `{ lt: "2025-02-01" }`                     |

## Supported languages

| Language | Code | Import                                    |
| -------- | ---- | ----------------------------------------- |
| English  | `en` | `chronolizer` or `chronolizer/locales/en` |
| German   | `de` | `chronolizer/locales/de`                  |
| Spanish  | `es` | `chronolizer/locales/es`                  |
| French   | `fr` | `chronolizer/locales/fr`                  |
| Dutch    | `nl` | `chronolizer/locales/nl`                  |
| Turkish  | `tr` | `chronolizer/locales/tr`                  |
| Czech    | `cs` | `chronolizer/locales/cs`                  |
| Polish   | `pl` | `chronolizer/locales/pl`                  |

## Date filter reference

A date filter has at least one bound. It can have one lower bound and one upper bound.

| Key   | Meaning                     |
| ----- | --------------------------- |
| `gt`  | After the value, exclusive  |
| `gte` | On or after the value       |
| `lt`  | Before the value, exclusive |
| `lte` | On or before the value      |

An expression starts with `now` or an ISO date. Operations run from left to right.
Calendar shifts are not combined or canceled. For example, `2025-01-31||+1M+1M`
resolves to March 28, not March 31. Each month shift clamps the day to the last
valid day of that month. Time-zone gaps can also affect intermediate dates.

```text
expression := "now" operation* | YYYY-MM-DD | YYYY-MM-DD "||" operation+
operation  := ("+" | "-") positiveInteger unit | "/" unit
unit       := "d" | "w" | "M" | "q" | "y"
```

`/unit` moves a value to the start of its calendar unit. Add `||` before operations on a fixed date, for example `2025-01-01||+1M`.

A complete calendar period includes its start but excludes the start of the next period. Weeks start on Monday.

A named day without a year uses the current calendar year. Write the year for February 29 because parsing does not read the clock.

## Main API

| Export                | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `parseNatural`        | Parse complete natural-language input to a date range      |
| `formatNatural`       | Write a supported range as one standard phrase             |
| `suggestNatural`      | Return autocomplete suggestions and date ranges            |
| `parseFilter`         | Parse a date filter to a date range                        |
| `formatFilter`        | Format a date range as a date filter                       |
| `resolve`             | Calculate dates with an Effect clock and time zone         |
| `DateFilter`          | Validate external date-filter data with Effect Schema      |
| `DateRangeFromFilter` | Convert a filter in both directions with one Effect Schema |

## License

Chronolizer is available under the [MIT License](LICENSE).
