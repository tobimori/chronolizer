import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { GermanLanguageLayer } from "../src/locales/de.ts";
import { formatNatural, parseNatural } from "../src/natural/api.ts";

const parseGerman = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "de", typoMode }).pipe(Effect.provide(GermanLanguageLayer));

describe("German date ranges", () => {
  it.effect.each([
    ["heute", "now/d", "now/d+1d"],
    ["gestern", "now-1d/d", "now-1d/d+1d"],
    ["morgen", "now+1d/d", "now+1d/d+1d"],
    ["letzte Woche", "now-1w/w", "now-1w/w+1w"],
    ["diese Woche", "now/w", "now/w+1w"],
    ["nächste Woche", "now+1w/w", "now+1w/w+1w"],
    ["letzter Monat", "now-1M/M", "now-1M/M+1M"],
    ["dieser Monat", "now/M", "now/M+1M"],
    ["nächster Monat", "now+1M/M", "now+1M/M+1M"],
    ["letztes Quartal", "now-1q/q", "now-1q/q+1q"],
    ["dieses Quartal", "now/q", "now/q+1q"],
    ["nächstes Quartal", "now+1q/q", "now+1q/q+1q"],
    ["letztes Jahr", "now-1y/y", "now-1y/y+1y"],
    ["dieses Jahr", "now/y", "now/y+1y"],
    ["nächstes Jahr", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses German relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["Tag bis heute", "now/d"],
    ["Woche bis heute", "now/w"],
    ["Monat bis heute", "now/M"],
    ["Quartal bis heute", "now/q"],
    ["Jahr bis heute", "now/y"],
    ["seit Tagesbeginn", "now/d"],
    ["seit Wochenanfang", "now/w"],
    ["seit Beginn des Monats", "now/M"],
    ["dieses Quartal bisher", "now/q"],
    ["bisher dieses Jahr", "now/y"],
  ] as const)(
    "parses German period-to-date expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    "seit Jahresbeginn",
    "seit Jahresanfang",
    "seit Beginn des Jahres",
    "seit Anfang des Jahres",
    "seit Beginn dieses Jahres",
    "seit Anfang dieses Jahres",
    "vom Jahresbeginn bis heute",
    "vom Jahresanfang bis heute",
    "vom Beginn des Jahres bis heute",
    "vom Anfang des Jahres bis heute",
    "dieses Jahr bisher",
    "bisher dieses Jahr",
  ])(
    "canonicalizes German year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe("seit Jahresbeginn");
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    "die letzten 3 Monate",
    "letzten 3 Monate",
    "letzte 3 Monate",
    "vergangene 3 Monate",
    "vorherige 3 Monate",
    "in den letzten 3 Monaten",
    "in den vergangenen 3 Monaten",
    "in den vorherigen 3 Monaten",
    "während der letzten 3 Monate",
    "3 Monate",
  ])(
    "canonicalizes German counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe("letzte 3 Monate");
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["letzte 2 Tage", "now-2d"],
    ["letzte 2 Wochen", "now-2w"],
    ["letzte 2 Monate", "now-2M"],
    ["letzte 2 Quartale", "now-2q"],
    ["letzte 2 Jahre", "now-2y"],
  ] as const)(
    "maps German counted trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["die nächsten 2 Tage", "now+2d"],
    ["nächste 2 Wochen", "now+2w"],
    ["in den nächsten 2 Monaten", "now+2M"],
    ["in den kommenden 2 Quartalen", "now+2q"],
    ["innerhalb der nächsten 2 Jahre", "now+2y"],
    ["innerhalb von 2 Jahren", "now+2y"],
  ] as const)(
    "maps German future rolling range %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["vor 30 Monaten", "now-30M/M", "now-30M/M+1M", "vor 30 Monaten"],
    ["2 Wochen zuvor", "now-2w/w", "now-2w/w+1w", "vor 2 Wochen"],
    ["in 3 Jahren", "now+3y/y", "now+3y/y+1y", "in 3 Jahren"],
    ["vor 1 Tag", "now-1d/d", "now-1d/d+1d", "gestern"],
  ] as const)(
    "maps German calendar-offset period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["Januar 2025", "2025-01-01", "2025-02-01"],
    ["Februar 2025", "2025-02-01", "2025-03-01"],
    ["März 2025", "2025-03-01", "2025-04-01"],
    ["April 2025", "2025-04-01", "2025-05-01"],
    ["Mai 2025", "2025-05-01", "2025-06-01"],
    ["Juni 2025", "2025-06-01", "2025-07-01"],
    ["Juli 2025", "2025-07-01", "2025-08-01"],
    ["August 2025", "2025-08-01", "2025-09-01"],
    ["September 2025", "2025-09-01", "2025-10-01"],
    ["Oktober 2025", "2025-10-01", "2025-11-01"],
    ["November 2025", "2025-11-01", "2025-12-01"],
    ["Dezember 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed German month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["Q1 2025", "2025-01-01", "2025-04-01", "Q1 2025"],
    ["2025 Q2", "2025-04-01", "2025-07-01", "Q2 2025"],
    ["3. Quartal 2025", "2025-07-01", "2025-10-01", "Q3 2025"],
    ["viertes Quartal 2025", "2025-10-01", "2026-01-01", "Q4 2025"],
    ["Q1 letzten Jahres", "now-1y/y", "now-1y/y+1q", "Q1 letzten Jahres"],
    ["2. Quartal nächsten Jahres", "now+1y/y+3M", "now+1y/y+3M+1q", "Q2 nächsten Jahres"],
  ] as const)(
    "maps German quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["01. Januar 2025", "2025-01-01", "2025-01-02"],
    ["31 Januar 2025", "2025-01-31", "2025-02-01"],
    ["1. Jan 2025", "2025-01-01", "2025-01-02"],
    ["29.02.2024", "2024-02-29", "2024-03-01"],
  ] as const)(
    "maps named German date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["Wochenende", "now/w+5d", "now/w+7d", "dieses Wochenende"],
    ["am Wochenende", "now/w+5d", "now/w+7d", "dieses Wochenende"],
    ["vergangenes Wochenende", "now-1w/w+5d", "now-1w/w+7d", "letztes Wochenende"],
    ["kommendes Wochenende", "now+1w/w+5d", "now+1w/w+7d", "nächstes Wochenende"],
    ["vorletztes Wochenende", "now-2w/w+5d", "now-2w/w+7d", "vorletztes Wochenende"],
    ["übernächstes Wochenende", "now+2w/w+5d", "now+2w/w+7d", "übernächstes Wochenende"],
  ] as const)(
    "maps German weekend expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["Jan 2025", "2025-01-01", "2025-02-01", "Januar 2025"],
    ["Feb. 2025", "2025-02-01", "2025-03-01", "Februar 2025"],
    ["Mär 2025", "2025-03-01", "2025-04-01", "März 2025"],
    ["Mrz. 2025", "2025-03-01", "2025-04-01", "März 2025"],
    ["Apr 2025", "2025-04-01", "2025-05-01", "April 2025"],
    ["Jun. 2025", "2025-06-01", "2025-07-01", "Juni 2025"],
    ["Jul 2025", "2025-07-01", "2025-08-01", "Juli 2025"],
    ["Aug. 2025", "2025-08-01", "2025-09-01", "August 2025"],
    ["Sep 2025", "2025-09-01", "2025-10-01", "September 2025"],
    ["Sept. 2025", "2025-09-01", "2025-10-01", "September 2025"],
    ["Okt 2025", "2025-10-01", "2025-11-01", "Oktober 2025"],
    ["Nov. 2025", "2025-11-01", "2025-12-01", "November 2025"],
    ["Dez 2025", "2025-12-01", "2026-01-01", "Dezember 2025"],
  ] as const)(
    "canonicalizes abbreviated German month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["Januar letzten Jahres", "now-1y/y", "now-1y/y+1M"],
    ["Juni dieses Jahres", "now/y+5M", "now/y+6M"],
    ["Dezember nächsten Jahres", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "keeps German named month in its relative year for %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["seit Januar 2025", { gte: "2025-01-01" }],
    ["ab Januar 2025", { gte: "2025-01-01" }],
    ["seit Anfang Januar 2025", { gte: "2025-01-01" }],
    ["ab Beginn Januar 2025", { gte: "2025-01-01" }],
    ["vor Januar 2025", { lt: "2025-01-01" }],
    ["bis Januar 2025", { lt: "2025-01-01" }],
    ["bis zum Anfang von Januar 2025", { lt: "2025-01-01" }],
    ["bis einschließlich Januar 2025", { lt: "2025-02-01" }],
    ["bis Ende Januar 2025", { lt: "2025-02-01" }],
    ["bis zum Ende von Januar 2025", { lt: "2025-02-01" }],
    ["nach Januar 2025", { gte: "2025-02-01" }],
    ["ab Ende Januar 2025", { gte: "2025-02-01" }],
    ["vor Jahresbeginn", { lt: "now/y" }],
    ["bis Monatsanfang", { lt: "now/M" }],
    ["bis Quartalsende", { lt: "now/q+1q" }],
    ["ab Jahresende", { gte: "now/y+1y" }],
    ["seit dem Jahr 2020", { gte: "2020-01-01" }],
    ["bis zum Jahr 2020", { lt: "2020-01-01" }],
  ] as const)(
    "maps German open-boundary expression %s",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual(expected);
    }),
  );

  it.effect.each([
    ["Anfang Januar 2025", "2025-01-01", "2025-01-01||+1d"],
    ["Beginn nächstes Jahr", "now+1y/y", "now+1y/y+1d"],
    ["Ende März 2025", "2025-04-01||-1d", "2025-04-01"],
    ["Ende letztes Jahr", "now-1y/y+1y-1d", "now-1y/y+1y"],
  ] as const)(
    "maps German period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["Rest der Woche", "Rest dieser Woche"])(
    "canonicalizes remaining German period %j",
    Effect.fn(function* (input) {
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now", lt: "now/w+1w" });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe("Rest der Woche");
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each(["im Januar 2025", "für Januar 2025", "während Januar 2025"])(
    "canonicalizes German period wrapper in %j",
    Effect.fn(function* (input) {
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe("Januar 2025");
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["vorletzten Monat", "now-2M/M", "now-2M/M+1M", "vor 2 Monaten"],
    ["übernächstes Jahr", "now+2y/y", "now+2y/y+1y", "in 2 Jahren"],
  ] as const)(
    "maps German outer relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["bis heute", { lte: "now" }, "bis heute"],
    ["bis jetzt", { lte: "now" }, "bis heute"],
    ["ab jetzt", { gte: "now" }, "ab jetzt"],
    ["von jetzt an", { gte: "now" }, "ab jetzt"],
  ] as const)(
    "maps German open now boundary %s",
    Effect.fn(function* (testCase) {
      const [input, expected, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual(expected);
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect.each([
    ["von Januar 2025 bis heute", { gte: "2025-01-01", lte: "now" }, "von Januar 2025 bis heute"],
    [
      "zwischen Januar 2025 und heute",
      { gte: "2025-01-01", lte: "now" },
      "von Januar 2025 bis heute",
    ],
    ["von heute bis Januar 2027", { gte: "now", lt: "2027-02-01" }, "von heute bis Januar 2027"],
    [
      "zwischen heute und Januar 2027",
      { gte: "now", lt: "2027-02-01" },
      "von heute bis Januar 2027",
    ],
  ] as const)(
    "maps German now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, expected, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual(expected);
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect(
    "maps a German named-date dash range",
    Effect.fn(function* () {
      const result = yield* parseGerman("01. Januar 2025 - 31. Januar 2025");
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
    }),
  );

  it.effect.each(["2014-2018", "zwischen 2014-2018", "2014–2018", "2014~2018"])(
    "maps compact German year range %j",
    Effect.fn(function* (input) {
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({
        gte: "2014-01-01",
        lt: "2019-01-01",
      });
    }),
  );

  it.effect.each([
    "vom Februar 2024 bis März 2024",
    "von Februar 2024 bis zum März 2024",
    "von Februar 2024 bis einschließlich März 2024",
    "zwischen Februar 2024 und März 2024",
    "Februar 2024 bis März 2024",
    "Februar 2024 bis einschließlich März 2024",
  ])(
    "canonicalizes bounded German connector in %j",
    Effect.fn(function* (input) {
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(
        "von Februar 2024 bis März 2024",
      );
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect(
    "uses and renders both full periods in a German from-to range",
    Effect.fn(function* () {
      const result = yield* parseGerman("von Februar 2024 bis März 2024");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
      const rendered = yield* formatNatural(result.range, { locale: "de" }).pipe(
        Effect.provide(GermanLanguageLayer),
      );
      expect(rendered).toBe("von Februar 2024 bis März 2024");

      const relative = yield* parseGerman("von Mai bis Dezember");
      expect(formatFilter(relative.range)).toEqual({
        gte: "now/y+4M",
        lt: "now/y+12M",
      });
    }),
  );

  it.effect.each([
    ["letzten Monat", "now-1M/M", "now-1M/M+1M", "letzter Monat"],
    ["vergangene Woche", "now-1w/w", "now-1w/w+1w", "letzte Woche"],
    ["aktuelle Woche", "now/w", "now/w+1w", "diese Woche"],
    ["laufendes Quartal", "now/q", "now/q+1q", "dieses Quartal"],
    ["kommendes Jahr", "now+1y/y", "now+1y/y+1y", "nächstes Jahr"],
    ["folgenden Monat", "now+1M/M", "now+1M/M+1M", "nächster Monat"],
  ] as const)(
    "canonicalizes German relative-period inflection %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "de" })).toBe(canonical);
    }, Effect.provide(GermanLanguageLayer)),
  );

  it.effect(
    "renders canonical German phrases",
    Effect.fn(function* () {
      const complete = yield* parseGerman("JANUAR   2025");
      const open = yield* parseGerman("seit Januar 2025");
      const renderedComplete = yield* formatNatural(complete.range, {
        locale: "de",
      }).pipe(Effect.provide(GermanLanguageLayer));
      const renderedOpen = yield* formatNatural(open.range, {
        locale: "de",
      }).pipe(Effect.provide(GermanLanguageLayer));
      expect(renderedComplete).toBe("Januar 2025");
      expect(renderedOpen).toBe("seit Januar 2025");
    }),
  );

  it.effect(
    "rejects a German positive range when future ranges are disabled",
    Effect.fn(function* () {
      const error = yield* Effect.flip(
        parseNatural("die nächsten 3 Monate", { locale: "de", allowFuture: false }).pipe(
          Effect.provide(GermanLanguageLayer),
        ),
      );
      expect(error._tag).toBe("NaturalLanguageParseError");
      expect(error.message).toBe(
        "The expression contains a positive relative shift, but future ranges are disabled",
      );
    }),
  );

  it.effect(
    "corrects German typos only in tolerant mode",
    Effect.fn(function* () {
      const result = yield* parseGerman("januar lezten jahres", "tolerant");
      expect(result.quality).toBe("corrected");
      expect(result.corrections).toMatchObject([
        { original: "lezten", replacement: "letzten", distance: 1 },
      ]);
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1y/y",
        lt: "now-1y/y+1M",
      });
    }),
  );

  it.effect(
    "does not correct short or over-budget German words",
    Effect.fn(function* () {
      const shortWord = yield* Effect.flip(parseGerman("mei 2025", "tolerant"));
      const distantWord = yield* Effect.flip(parseGerman("xxxxxxxx 2025", "tolerant"));
      expect(shortWord._tag).toBe("NaturalLanguageParseError");
      expect(distantWord._tag).toBe("NaturalLanguageParseError");
    }),
  );

  it.effect(
    "normalizes German Unicode width, case, and whitespace",
    Effect.fn(function* () {
      const result = yield* parseGerman("  ＭÄＲＺ　２０２４  ");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-03-01",
        lt: "2024-04-01",
      });
    }),
  );

  it.effect.each([
    "",
    "2025-02-29",
    "1900-02-29",
    "31. Februar 2025",
    "29. Februar 2025",
    "9999-12-31",
    "Januar 2025 zusätzlich",
    "letzten Monat über",
    "0 Monate",
    "1 Monate",
    "2 Monat",
    "vor 1 Monaten",
    "vor 2 Monat",
    "Q5 2025",
    "zeige Ergebnisse seit Januar 2025",
  ])(
    "rejects unsupported complete German input %j",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseGerman(input));
      expect(error._tag).toBe("NaturalLanguageParseError");
      expect(error).toMatchObject({ input, locale: "de" });
    }),
  );

  it.effect.each([
    "heute",
    "letzte Woche",
    "nächstes Quartal",
    "dieses Jahr",
    "März 2025",
    "Dezember nächsten Jahres",
    "2024-02-29",
    "2025",
    "bis einschließlich Januar 2025",
    "von 2024-02-29 bis 2024-03-01",
  ])(
    "round-trips canonical German phrase %j",
    Effect.fn(function* (phrase) {
      const parsed = yield* parseGerman(phrase);
      const rendered = yield* formatNatural(parsed.range, { locale: "de" }).pipe(
        Effect.provide(GermanLanguageLayer),
      );
      const reparsed = yield* parseGerman(rendered);
      expect(formatFilter(reparsed.range)).toEqual(formatFilter(parsed.range));
    }),
  );
});
