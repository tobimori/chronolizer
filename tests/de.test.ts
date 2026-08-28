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
  ] as const)(
    "parses German period-to-date expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each(["die letzten 3 Monate", "letzten 3 Monate", "letzte 3 Monate", "3 Monate"])(
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
    ["vor Januar 2025", { lt: "2025-01-01" }],
    ["bis einschließlich Januar 2025", { lt: "2025-02-01" }],
    ["nach Januar 2025", { gte: "2025-02-01" }],
  ] as const)(
    "maps German open-boundary expression %s",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const result = yield* parseGerman(input);
      expect(formatFilter(result.range)).toEqual(expected);
    }),
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
    "9999-12-31",
    "Januar 2025 zusätzlich",
    "Jan 2025",
    "letzten Monat über",
    "0 Monate",
    "1 Monate",
    "2 Monat",
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
